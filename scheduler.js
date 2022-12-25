import { getAllServers, getRoot, updateScripts } from "./utilities";
import { Logger } from "./logger";
import { BatchRunner } from "./batchRunner";
import { schedulerConfig as config, timing } from "./config";
import { EMPTY_PORT, ports } from "./constants";
import { BatchJob } from "./job";
import { weakenAnalyzeThreads, getWeakenScriptRam, analyzeIncomeRate } from "./hgwUtilities";

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
    constructor(ns, batchRunnerType) {
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
        this.rootedServers = [];
        /** @type {Number} */
        this.hackAmount = config.hackAmount;
        /** @type {String[]} */
        this.untargetedServers = [];
        /** @type {Number} */
        this.updateInterval = config.updateInterval //ms;
        /** @type {BatchRunner[]} */
        this.batchRunners = [];
        /** @type {BatchRunner[]} */
        this.initializingRunners = [];
        this.statsInterval = config.statsInterval;
        this.now = Date.now();
        this.maxRunners = config.maxRunners;
        this.loopTimes = [];
        this.drifts = [];
        // limit total number of batches that can run
        // things start to get wonky after 300
        this.maxBatches = config.maxBatches;
    }

    async run() {
        this.logger.trace(`run()`);
        this.initialize();

        while (true) {
            let now = Date.now();
            let drift = now - (this.now + this.updateInterval);
            this.now = now;
            this.drifts.push(drift);
            this.updateServers();
            this.updateBatchRunners();
            this.startNewBatchRunner();
            if ((now % this.statsInterval) <= this.updateInterval) {
                this.displayStatistics();
            }
            let loopEnd = Date.now()
            this.loopTimes.push(loopEnd - now);
            await this.ns.sleep(this.updateInterval);
        }
    }

    initialize() {
        updateScripts(this.ns);
        this.updateServers();
        this.workers.forEach((w) => this.ns.killall(w.hostname, true));
        this.portHandle.clear();
    }

    updateServers() {
        let curLenRootedServers = this.rootedServers.length;
        this.rootedServers = getAllServers(this.ns).filter((s) => getRoot(this.ns, s));
        if (this.rootedServers.length > curLenRootedServers) {
            this.updateWorkers();
            this.updateTargets();
        }
    }

    /** @returns {Worker[]} */
    updateWorkers() {
        this.logger.trace(`updateWorkers()`);
        this.rootedServers.filter((x) => x !== "home").map((s) => {
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

    updateTargets() {
        // prioritize targets
        // by required hacking level > 1/3 player hacking skill
        // then by max money
        // then by growth
        let targets = [];
        if (this.ns.fileExists("Formulas.exe")) {
            targets = this.getTargetsFormula();
        } else {
            targets = this.getTargets();
        }

        this.untargetedServers = targets.filter((s) => this.batchRunners.findIndex((x) => x.target === s) === -1);

        // if we found some better targets than what we're currently hacking, reallocate runners.
        if (this.untargetedServers.length > 0 && this.batchRunners.length === this.maxRunners) {
            let removeRunners = this.batchRunners.filter((r) => targets.findIndex((t) => t === r.target) === -1);
            removeRunners.forEach((r) => r.cancelJobs());
            this.batchRunners = this.batchRunners.filter((r) => targets.findIndex((t) => t === r.target) !== -1);
        }
    }

    getTargets() {
        let hacking = this.ns.getPlayer().skills.hacking;
        return this.rootedServers.map((s) => {
            let hackingRatio = Math.min(3, hacking / this.ns.getServerRequiredHackingLevel(s));
            return {
                hostname: s,
                maxMoney: this.ns.getServerMaxMoney(s),
                growth: this.ns.getServerGrowth(s),
                hackingRatio: hackingRatio
            };
        }).filter((s) => !(
            s.hostname.startsWith("pserv")
            || s.hostname === "home"
            || s.maxMoney <= 0
            || s.hackingRatio <= 0)
        ).sort((a, b) => b.growth - a.growth
        ).sort((a, b) => b.maxMoney - a.maxMoney
        ).sort((a, b) => b.hackingRatio - a.hackingRatio
        ).map((s) => s.hostname
        ).slice(0, this.maxRunners);
    }

    getTargetsFormula() {
        let targets = [];
        let hackableServers = this.rootedServers.map((s) => {
            return {
                hostname: s,
                maxMoney: this.ns.getServerMaxMoney(s),
                growth: this.ns.getServerGrowth(s),
                requiredHackingLevel: this.ns.getServerRequiredHackingLevel(s),
                minHackDifficulty: this.ns.getServerMinSecurityLevel(s)
            };
        }).filter((s) => !(
            s.hostname.startsWith("pserv")
            || s.hostname === "home"
            || s.maxMoney <= 0
            || s.hackingRatio <= 0));

        for (let server of hackableServers) {
            let incomeRate = analyzeIncomeRate(this.ns, server.hostname, this.hackAmount);

            targets.push({
                hostname: server.hostname,
                incomeRate: incomeRate
            });
        }

        return targets.sort((a, b) => b.incomeRate - a.incomeRate
        ).slice(0, this.maxRunners
        ).map((s) => s.hostname);
    }


    updateBatchRunners() {
        this.logger.trace("updateBatchRunners()");

        this.batchRunners.forEach((r) => r.cancelHackLevelUpBatch());
        // check batch tasks expected end time for drift > tolerance.
        this.batchRunners.forEach((r) => r.checkBatchEstimatedTimes());

        // check for task finished reports
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
            runner.checkTargetInitialization();
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
            if (zombieBatches.length > 0) {
                this.logger.warn(`Zombie batches detected, resetting.`);
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
    startNewBatch(runner, hackAmount = null) {
        this.logger.trace(`startNewBatch(): ${runner.target} ${runner.timeSinceLastBatch} ${runner.batches.length}`);
        if (runner.getTimeSinceLastBatch() < timing.newBatchDelay
            || runner.batches.length >= runner.maxBatches
            || this.getTotalBatches() >= this.maxBatches) {
            return
        }

        let executionPlan = runner.getExecutionPlan(hackAmount);
        if (runner.initializing) {
            executionPlan = runner.getInitializeExecutionPlan(hackAmount);
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
        if (!runner.checkTargetStatus()) {
            // hack amount is different upon initilization
            let maxMoney = this.ns.getServerMoneyAvailable(runner.target);
            let hackAmount = maxMoney / Math.max(1, maxMoney - this.ns.getServerMoneyAvailable(runner.target));
            hackAmount = Math.ceil((hackAmount + Number.EPSILON) * 100) / 100;

            this.startNewBatch(runner, hackAmount);
        }
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
        if (this.untargetedServers.length > 0) {
            let target = this.untargetedServers.shift();
            this.logger.info(`creating new batch runner for ${target}`)

            // create a BatchRunner with maxBatches=1 for initialization purposes
            let batchRunner = new this.batchRunnerType(this.ns, target, 1, this.hackAmount);
            this.batchRunners.push(batchRunner);
            this.initializeBatchRunnerTarget(batchRunner);
        }
    }

    displayStatistics() {
        const [dollarsPerSec, dollarsSinceAug] = this.ns.getTotalScriptIncome();
        const expGain = this.ns.getTotalScriptExpGain();

        const avgUpdateTime = this.loopTimes.reduce((p, c) => p + c, 0) / this.loopTimes.length;
        const maxDrift = this.drifts.reduce((p, c) => c - p > 0 ? c : p);
        const totalDrift = this.drifts.reduce((p, c) => p + c, 0);
        const avgDrift = totalDrift / this.drifts.length;
        this.loopTimes = [];
        this.drifts = [];

        let stats = {
            totalDrift: this.ns.nFormat(totalDrift, "0.000"),
            maxDrift: this.ns.nFormat(maxDrift, "0.000"),
            avgDrift: this.ns.nFormat(avgDrift, "0.000"),
            avgUpdateTime: this.ns.nFormat(avgUpdateTime, "0.000"),
            moneyPerSec: this.ns.nFormat(dollarsPerSec, "$0.000a"),
            expPerSec: this.ns.nFormat(expGain, "0.000a"),
            running: 0,
            succeeded: 0,
            failed: 0,
            cancelled: 0,
            runners: []
        };

        this.batchRunners.map((r) => {
            return {
                target: r.target,
                running: r.batches.length,
                succeeded: r.succeededBatches,
                failed: r.failedBatches,
                cancelled: r.cancelledBatches
            }
        }).forEach((r) => {
            stats.runners.push(r);
            stats.running += r.running;
            stats.succeeded += r.succeeded;
            stats.failed += r.failed;
            stats.cancelled += r.cancelled;
        });

        this.logger.info(`Batcher Stats: ${JSON.stringify(stats, null, 2)}`);
    }


    getTotalBatches() {
        return this.batchRunners.map((b) => b.batches.length).reduce((p, c) => p + c);
    }
}