import { getAllHackableServers, getAllRootedServers, getRoot, nFormatter, updateScripts } from "./utilities";
import { Logger } from "./logger";
import { BatchRunner } from "./batchRunner";
import { timing } from "./config";
import { EMPTY_PORT, ports } from "./constants";
import { BatchJob } from "./job";

/**
 * @typedef {Object} Worker
 * @property {String} hostname
 * @property {Number} maxRam
 * @property {Number} freeRam
*/

export class Scheduler {
    /** 
     * @param {NS} ns
     * @param {typeof BatchRunner} batchRunnerType
     */
    constructor(ns, batchRunnerType, enableStats) {
        this.logger = new Logger(ns, "Scheduler");
        this.logger.disableNSLogs();
        this.logger.trace(`new Scheduler()`);
        this.ns = ns;
        this.batchRunnerType = batchRunnerType;
        this.portHandle = ns.getPortHandle(ports.BATCH_STATUS);
        /** @type {Worker[]} */
        this.workers = [{
            hostname: "home",
            maxRam: (this.ns.getServerMaxRam("home") / 2) - 0.05,
            freeRam: (this.ns.getServerMaxRam("home") / 2) - 0.05
        }];
        /** @type {String[]} */
        this.hackableServers = [];
        /** @type {Number} */
        this.hackAmount = 0.10;
        /** @type {String[]} */
        this.untargetedServers = [];
        /** @type {Number} */
        this.updateInterval = 50 //ms;
        /** @type {BatchRunner[]} */
        this.batchRunners = [];
        /** @type {BatchRunner[]} */
        this.initializingRunners = [];
        this.enableStats = enableStats;
        this.statsInterval = 5000;
        this.now = Date.now();
        this.drift = 0;
    }

    async run() {
        this.logger.trace(`run()`);
        this.initialize();

        while (true) {
            let now = Date.now();
            this.drift = now - (this.now + this.updateInterval);
            this.now = now;
            if (this.drift >= 100) {
                this.logger.warn(`Drift >100`);
            }
            this.updateWorkers();
            this.updateHackableServers();
            this.updateBatchRunners();
            this.startNewBatchRunner();
            if((now % this.statsInterval) <= this.updateInterval) {
                this.displayStatistics();
            }
            let loopEnd = Date.now()
            let loopTime = loopEnd - now;
            this.logger.debug(`Loop took ${loopTime}ms`);
            await this.ns.sleep(this.updateInterval);
        }
    }

    initialize() {
        updateScripts(this.ns);
        this.updateWorkers();
        this.workers.forEach((w) => this.ns.killall(w.hostname, true));
        this.portHandle.clear();
    }

    /** @returns {Worker[]} */
    updateWorkers() {
        this.logger.trace(`updateWorkers()`);
        getAllRootedServers(this.ns).filter((x) => x !== "home").map((s) => {
            let maxRam = this.ns.getServerMaxRam(s) - 0.05;
            return {
                hostname: s,
                maxRam: maxRam,
                freeRam: maxRam
            }
        }).forEach((s) => {
            if (this.workers.findIndex((x) => x.hostname === s.hostname) < 0) {
                this.workers.push(s);
            }
        })
    }

    updateHackableServers() {
        this.logger.trace(`updateHackableServers()`);
        getAllHackableServers(this.ns).forEach((s) => {
            getRoot(this.ns, s)
            if (this.hackableServers.findIndex((x) => x === s) < 0) {
                this.hackableServers.push(s);
            }
        })
    }

    updateBatchRunners() {
        this.logger.trace("updateBatchRunners()");
        while (this.portHandle.peek() !== EMPTY_PORT) {
            // get task finished data from port
            let portData = JSON.parse(this.portHandle.read());
            this.logger.debug(`portData=${JSON.stringify(portData)}`)

            // find associated batch
            let ix = this.batchRunners.findIndex((x) => x.target === portData.target);
            if (ix < 0) {
                this.logger.warn(`found no batcher associated with target=${portData.target}`);
                continue;
            }

            this.batchRunners[ix].updateBatchStatus(portData);
        } 


        
        for (let runner of this.initializingRunners) {
            if (runner.initializing) {
                continue;
            }

            let executionPlan = runner.getExecutionPlan();
            let maxBatches = Math.floor(executionPlan.getDuration() / (4 * timing.batchTaskDelay));
            runner.maxBatches = maxBatches;
        }

        this.initializingRunners = this.initializingRunners.filter((r) => r.initializing);

        for (let runner of this.batchRunners) {
            let zombieBatches = runner.getZombieBatches();
            if (zombieBatches.length > 0){
                runner.needsReset = true;
            }
            if (runner.needsReset) {
                // reinitialize
                runner.cancelJobs();
                runner.batches.forEach((j) => this.releaseWorkers(j));
                runner.reset();
                runner.maxBatches = 1;
                this.initializeBatchRunnerTarget(runner);
            } else {
                // release workers for finished jobs
                let completedBatches = runner.getCompletedBatches();
                completedBatches.forEach((j) => this.releaseWorkers(j));

                // clear finished jobs
                runner.updateBatches();

                // create new job
                this.startNewBatch(runner);
            }
        }
    }

    /** @param {BatchRunner} runner */
    startNewBatch(runner, hackAmount=null) {
        this.logger.trace(`startNewBatch(): ${runner.target} ${runner.timeSinceLastBatch} ${runner.batches.length}`);
        if (runner.getTimeSinceLastBatch() < timing.newBatchDelay || runner.batches.length >= runner.maxBatches){
            return
        }
    
        let executionPlan = runner.getExecutionPlan(hackAmount);
        // run only gw part of plan if initializing
        if (runner.initializing) {
            executionPlan.tasks = executionPlan.tasks.filter((t) => t.finishOrder > 1);
        }

        // try to reserve resources
        let job = new BatchJob(this.ns, runner.target, executionPlan, runner.getNextBatchId());
        let reserveSuccess = this.reserveWorkers(job);
        if (!reserveSuccess) {
            this.logger.warn(`No workers available for job ${runner.target} - ${job.id}`);
            this.releaseWorkers(job);
            return
        }

        // try to start job
        let startSuccess = runner.startBatch(job);
        if (!startSuccess) {
            this.logger.warn(`Job failed to start ${runner.target} - ${job.id}`);
            this.releaseWorkers(job);
        }

        return reserveSuccess && startSuccess;
    }

    /** @param {BatchRunner} runner */
    initializeBatchRunnerTarget(runner) {
        this.logger.trace(`initializeBatchRunnerTarget(): ${runner.target}`);
        runner.initializing = true;
        this.initializingRunners.push(runner);

        // hack amount is different upon initilization
        let maxMoney = this.ns.getServerMoneyAvailable(runner.target);
        let hackAmount = maxMoney / Math.max(1, maxMoney - this.ns.getServerMoneyAvailable(runner.target));
        hackAmount = Math.ceil((hackAmount + Number.EPSILON) * 100) / 100;
    
        this.startNewBatch(runner, hackAmount);
    }

    /** @param {BatchJob} job */
    reserveWorkers(job) {
        this.logger.trace(`reserveWorkers(): ${job.id} ${job.target}`);
        let success = true;
        for (let task of job.executionPlan.tasks) {
            let ix = this.workers.findIndex((w) => w.freeRam > task.resources.Ram);
            if (ix < 0) {
                success = false;
                break;
            }
            let worker = this.workers[ix];
            //this.logger.info(`reserved ${worker.hostname}, feeRam ${worker.freeRam}, actual ${this.ns.getServerMaxRam(worker.hostname) - this.ns.getServerUsedRam(worker.hostname)}`)
            worker.freeRam -= task.resources.Ram;
            task.worker = worker.hostname;
        }
        return success;
    }

    /** @param {BatchJob} job */
    releaseWorkers(job) {
        this.logger.trace(`releaseWorkers(): ${job.id} ${job.target}`);
        for (let task of job.executionPlan.tasks.filter((t) => t.worker !== null)) {
            var worker = this.workers.find((w) => w.hostname === task.worker);
            worker.freeRam += task.resources.Ram;
            task.worker = null;
        }
    }

    startNewBatchRunner() {
        this.logger.trace("startNewBatchRunner()");
        this.untargetedServers = this.hackableServers.filter((s) => this.batchRunners.findIndex((x) => x.target === s) == -1);
        this.untargetedServers.sort(this.compareFn);
        this.logger.info(`targets=${JSON.stringify(this.untargetedServers)}`)
        if (this.untargetedServers.length > 0) {
            let target = this.untargetedServers.shift();
            this.logger.info(`creating new batch runner for ${target}`)

            // create a BatchRunner with maxBatches=1 for initialization purposes
            let batchRunner = new this.batchRunnerType(this.ns, target, 1, this.hackAmount);
            this.batchRunners.push(batchRunner);
            this.initializeBatchRunnerTarget(batchRunner);
        }
    }

    prioritizeTargets() {
        this.untargetedServers.sort((a, b) => {
            let hacking = this.ns.getPlayer().skills.hacking
            let aHackingRatio = Math.max(3, hacking / this.ns.getServerRequiredHackingLevel(a));
            let bHackingRatio = Math.max(3, hacking / this.ns.getServerRequiredHackingLevel(b));
            if (aHackingRatio > bHackingRatio) {
                return 1;
            } else if (bHackingRatio > aHackingRatio) {
                return -1;
            } else {
                if (this.ns.getServerGrowth(a) > this.ns.getServerGrowth(b)) {
                    return 1;
                } else if (this.ns.getServerGrowth(b) > this.ns.getServerGrowth(a)) {
                    return -1;
                }
                else {
                    return this.ns.getServerMaxMoney(a) - this.ns.getServerMaxMoney(b);
                }
            }
        });
    }

    displayStatistics() {
        const [dollarsPerSec, dollarsSinceAug] = this.ns.getTotalScriptIncome();
        const expGain = this.ns.getTotalScriptExpGain();

        const formattedExpGain = this.ns.nFormat(expGain, "0.000a");
        const formattedDollarsPerSec = this.ns.nFormat(dollarsPerSec, "$0.000a")

        let stats = {
            moneyPerSec: formattedDollarsPerSec,
            expPerSec: formattedExpGain,
            running: 0,
            succeeded: 0,
            failed: 0
        }

        this.batchRunners.forEach((r) => {
            stats.running+=r.batches.length;
            stats.succeeded+=r.succeededBatches;
            stats.failed+=r.failedBatches;
        })

        this.logger.info(`Batcher Stats: ${JSON.stringify(stats, null, 2)}`);
    }
}