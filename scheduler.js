import { getAllHackableServers, getAllRootedServers, getRoot, updateScripts } from "./utilities";
import { HWGWExecutionPlanBuilder, ExecutionPlan } from "./executionPlan";
import { Logger } from "./logger";
import { BatchRunner } from "./batchRunner";
import { timing } from "./config";
import { EMPTY_PORT, ports } from "./constants";

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
        this.workers = [];
        /** @type {String[]} */
        this.hackableServers = [];
        /** @type {Number} */
        this.hackAmount = 0.10;
        /** @type {String[]} */
        this.untargetedServers = ["phantasy"];
        /** @type {Number} */
        this.updateInterval = 50 //ms;
        /** @type {BatchRunner[]} */
        this.batchRunners = [];
        /** @type {BatchRunner[]} */
        this.initializingRunners = [];
        this.enableStats = enableStats;
        this.statsInterval = 5000;
    }

    async run() {
        this.logger.trace(`run()`);
        this.initialize();

        while (true) {
            this.updateWorkers();
            this.updateHackableServers();
            this.updateBatchRunners();
            this.startNewBatchRunner();

            if(this.enableStats && (Date.now() % this.statsInterval) <= 100) {
                this.displayStatistics();
            }
            await this.ns.sleep(this.updateInterval);
        }
    }

    initialize() {
        updateScripts(this.ns);
        this.updateWorkers();
        this.workers.forEach((w) => this.ns.killall(w.hostname, true));
        this.portHandle.clear();
    }

    updateWorkers() {
        this.logger.trace(`updateWorkers()`);
        getAllRootedServers(this.ns).filter((x) => x !== "home").map((s) => {
            let maxRam = this.ns.getServerMaxRam(s)
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

            this.releaseWorkers(runner.workerSlots);
            let executionPlan = runner.getExecutionPlan();
            let maxBatches = Math.floor(executionPlan.getDuration() / (4 * timing.batchTaskDelay));
            let taskSlots = {}
            for (let i = 0; i < maxBatches; i++) {
                var newTaskSlots = this.reserveWorkers(executionPlan)
                for (let taskName in newTaskSlots) {
                    if (!taskSlots.hasOwnProperty(taskName)){
                        taskSlots[taskName] = {};
                    }
                    let newWorkerSlots = newTaskSlots[taskName];
                    for (let hostname in newWorkerSlots) {
                        if (!taskSlots[taskName].hasOwnProperty(hostname)){
                            taskSlots[taskName][hostname] = {slots:0, slotRam:0};
                        }
                        taskSlots[taskName][hostname].slots += newWorkerSlots[hostname].slots;
                        taskSlots[taskName][hostname].slotRam += newWorkerSlots[hostname].slotRam;
                    }
                }
            }
            this.logger.info(JSON.stringify(taskSlots, null, 2))
            runner.workerSlots = taskSlots;
            runner.maxBatches = maxBatches;
        }

        this.initializingRunners = this.initializingRunners.filter((r) => r.initializing);

        for (let runner of this.batchRunners) {
            if (runner.needsReset) {
                runner.reset();
            } else {
                runner.updateBatches();
                runner.startNewBatch();
            }
        }
    }

    /** @param {ExecutionPlan} executionPlan */
    reserveWorkers(executionPlan) {
        this.logger.trace(`reserveWorkers()`);
        let abort = false;
        let taskSlots = {};
        for (let task of executionPlan.tasks) {
            if (!taskSlots.hasOwnProperty(task.name)) {
                taskSlots[task.name] = {};
            }
            let workerSlots = taskSlots[task.name];

            let ix = this.workers.findIndex((w) => w.freeRam > task.resources.Ram);
            if (ix < 0) {
                abort = true;
                break;
            }
            let worker = this.workers[ix];
            worker.freeRam -= task.resources.Ram;
            if (!workerSlots.hasOwnProperty(worker.hostname)) {
                workerSlots[worker.hostname] = {slots:0, slotRam:task.resources.Ram};
            }
            workerSlots[worker.hostname].slots++;
        }

        if (abort) {
            this.releaseWorkers(taskSlots);
            taskSlots = {};
        }
        return taskSlots;
    }

    releaseWorkers(workerSlots) {
        for (let taskName in workerSlots) {
            let taskSlots = workerSlots[taskName];
            for(let hostname in taskSlots) {
                var worker = this.workers.find((w) => w.hostname === hostname);
                worker.freeRam += taskSlots[hostname].slotRam * taskSlots[hostname].slots;
            }
            delete workerSlots[taskName];
        }
    }

    startNewBatchRunner() {
        this.logger.trace("startNewBatchRunner()");
        //this.untargetedServers = this.hackableServers.filter((s) => this.batchRunners.findIndex((x) => x.target === s) == -1);
        if (this.untargetedServers.length > 0) {
            let target = this.untargetedServers.shift();
            this.logger.info(`creating new batch runner for ${target}`)

            // create a BatchRunner with maxBatches=1 for initialization purposes
            let batchRunner = new this.batchRunnerType(this.ns, target, 1, {}, this.hackAmount);

            let maxMoney = this.ns.getServerMoneyAvailable(target);
            let hackAmount = maxMoney / Math.max(1, maxMoney - this.ns.getServerMoneyAvailable(target));
            hackAmount = Math.ceil((hackAmount + Number.EPSILON) * 100) / 100;

            let executionPlan = new HWGWExecutionPlanBuilder(this.ns, target, hackAmount).build();
            executionPlan.tasks = executionPlan.tasks.filter((t) => t.finishOrder > 1);
            let workerSlots = this.reserveWorkers(executionPlan);
            if (Object.keys(workerSlots).length <= 0) {
                this.logger.warn(`Could not assign workers to BatchRunner[${target}]`);
            }
            batchRunner.workerSlots = workerSlots;

            this.initializingRunners.push(batchRunner);
            this.batchRunners.push(batchRunner);
            batchRunner.initializeTarget();
        }
    }

    displayStatistics() {
        this.ns.clearLog();
        const [dollarsPerSec, dollarsSinceAug] = this.ns.getTotalScriptIncome();
        const expGain = this.ns.getTotalScriptExpGain();
        
        this.logger.info(`Income ($/s): ${dollarsPerSec}`);
        this.logger.info(`Exp Gain Rate: ${expGain}`);
        this.logger.info(`Batch Runners:`)
        for(let runner of this.batchRunners){
            this.logger.info(`\t-Target: ${runner.target}`)
            this.logger.info(`\t\t-Running: ${runner.batches.length}`)
            this.logger.info(`\t\t-Succeeded: ${runner.succeededBatches}`);
            this.logger.info(`\t\t-Failed: ${runner.failedBatches}`)
        }
    }
}