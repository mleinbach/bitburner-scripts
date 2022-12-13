import { getAllHackableServers, getAllRootedServers, getRoot, updateScripts } from "./utilities";
import { BatchJob } from "./job";
import { timing } from "./config";
import { NSProcess } from "./nsProcess";
import { ExecutionPlan, ExecutionPlanBuilder } from "./executionPlan";
import { Logger } from "./logger";
import { BATCH_RUNNER_SCRIPT } from "./constants";

export class Scheduler {
    /** 
     * @param {NS} ns
     * @param {typeof ExecutionPlanBuilder} executionPlanBuilder 
     */
    constructor(ns, executionPlanBuilder) {
        this.logger = new Logger(ns, "Scheduler");
        this.logger.disableNSLogs();
        this.logger.debug(`constructor()`);
        this.ns = ns;
        this.executionPlanBuilder = executionPlanBuilder;
        this.batchRunners = [];
        this.workers = [];
        this.hackableServers = [];
        this.hackAmount = 0.10;
        this.untargetedServers = ["phantasy"];
    }

    async run() {
        this.logger.debug(`run()`);
        updateScripts(this.ns);

        while (true) {
            this.updateWorkers();
            this.updateHackableServers();

            //this.untargetedServers = this.hackableServers.filter((s) => this.batchRunners.findIndex((x) => x.target === s) == -1);
            this.logger.debug(`untargetedServers=${JSON.stringify(this.untargetedServers, null, 2)}`)
            if (this.untargetedServers.length > 0) {
                let target = this.untargetedServers.shift();
                this.logger.info(`creating new batch runner for ${target}`)
                await this.initializeServer(target)

                // create example batch job for requirements info
                let executionPlan = this.executionPlanBuilder.build(this.ns, target, this.hackAmount);
                const maxBatches = Math.floor(executionPlan.getDuration() / (executionPlan.tasks.length * timing.batchBetweenScriptDelay));

                // allocate workers for batches
                let reservedWorkers = {};
                for (let i = 0; i < maxBatches; i++) {
                    let jobWorkers = this.reserveWorkers(executionPlan);
                    for (let key in jobWorkers) {
                        if (!reservedWorkers.hasOwnProperty(key)) {
                            reservedWorkers[key] = [];
                        }
                        reservedWorkers[key].push(...jobWorkers[key])
                    }
                }

                this.logger.debug(`reservedWorkers: ${JSON.stringify(reservedWorkers)}`)
                if (Object.keys(reservedWorkers).length > 0) {
                    // register new batchRunner process
                    let batchRunnerArgs = [maxBatches, JSON.stringify(reservedWorkers), this.hackAmount, JSON.stringify(executionPlan.resourceRequirements)];
                    let batchRunner = new NSProcess(this.ns, target, BATCH_RUNNER_SCRIPT);
                    this.batchRunners.push(batchRunner);

                    // launch batchRunner
                    this.logger.info(`starting new batch runner for ${target}`)
                    batchRunner.execute("home", 1, batchRunnerArgs);
                } else {
                    this.logger.warn("could not assign workers to batch job")
                }
            }
            await this.ns.sleep(10000);
        }
    }

    // discoverBatchRunners() {
    //     let processes = this.ns.ps("home").filter((p) => p.filename === BATCH_RUNNER_SCRIPT);
    //     for (let pi of processes) {
    //         let id = ns.args[0]
    //         let target = ns.args[1];
    //         let maxBatches = ns.args[2];
    //         let workers = JSON.parse(ns.args[3]);
    //         let hackAmount = ns.args[4];
    //         let resourceRequirements = JSON.parse(ns.args[5]);
    //         let batchRunner = new NSProcess(this.ns, target, BATCH_RUNNER_SCRIPT);
    //         batchRunner.id = id;
    //         batchRunner.pid = pi.pid;

    //         for (let taskName in workers) {
    //             for (let worker of workers[taskName]){
                    
    //             }
    //         }
    //     }
    // }

    updateWorkers() {
        this.logger.debug(`updateWorkers()`);
        getAllRootedServers(this.ns).filter((x) => x !== "home").map((s) => {
            let maxRam = this.ns.getServerMaxRam(s)
            return {
                hostname: s,
                maxRam: maxRam,
                freeRam: maxRam,
                reservedRam: 0
            }
        }).forEach((s) => {
            if (this.workers.findIndex((x) => x.hostname === s) < 0) {
                this.workers.push(s);
            }
        })
    }

    updateHackableServers() {
        this.logger.debug(`updateHackableServers()`);
        getAllHackableServers(this.ns).forEach((s) => {
            getRoot(this.ns, s)
            if (this.hackableServers.findIndex((x) => x.hostname === s) < 0) {
                this.hackableServers.push(s);
            }
        })
    }

    /** @param {String} target */
    async initializeServer(target) {
        this.logger.debug(`initializeServer(${target})`);
        const minSecurity = this.ns.getServerMinSecurityLevel(target);
        const maxMoney = this.ns.getServerMaxMoney(target);
        let hackAmount = maxMoney / (maxMoney - this.ns.getServerMoneyAvailable(target));
        hackAmount = Math.ceil((hackAmount + Number.EPSILON) * 100) / 100;
        while ((this.ns.getServerSecurityLevel(target) > minSecurity) || (this.ns.getServerMoneyAvailable(target) < maxMoney)) {
            this.logger.debug(`${target} security - ${this.ns.getServerSecurityLevel(target)}/${minSecurity}`);
            this.logger.debug(`${target} money - ${this.ns.getServerMoneyAvailable(target)}/${maxMoney}`);
            let executionPlan = this.executionPlanBuilder.build(this.ns, target, hackAmount);
            let job = new BatchJob(this.ns, target, hackAmount, executionPlan);
            // use only grow/weaken part of batch

            job.executionPlan.tasks = job.executionPlan.tasks.filter((x) => x.finishOrder > 1);
            if (this.assignWorkersToJob(job)){
                job.run();
                await job.waitForCompletion();
            }
            else {  
                throw Error(`can't initialize target ${target}`)
            }
            this.releaseWorkers(job);
        }
        this.logger.debug(`${target} security - ${this.ns.getServerSecurityLevel(target)}/${minSecurity}`);
        this.logger.debug(`${target} money - ${this.ns.getServerMoneyAvailable(target)}/${maxMoney}`);
    }

    /** @param {ExecutionPlan} executionPlan */
    reserveWorkers(executionPlan) {
        this.logger.debug(`reserveWorkers()`);
        let abort = false;
        let reservedWorkers = {};
        for (let task of executionPlan.tasks) {
            let ix = this.workers.findIndex((w) => w.freeRam >= task.resources.Ram);
            if (ix >= 0) {
                this.workers[ix].freeRam -= task.resources.Ram;
                this.workers[ix].reservedRam += task.resources.Ram;
                if (!reservedWorkers.hasOwnProperty(task.name)) {
                    reservedWorkers[task.name] = [];
                }
                reservedWorkers[task.name].push(this.workers[ix].hostname);
            } else {
                abort = true;
                break;
            }
        }

        if (abort) {
            executionPlan.tasks.forEach((t) => {
                let ix = this.workers.findIndex((w) => w.hostname === t.worker);
                if (ix >= 0 ){
                    this.workers[ix].freeRam += t.resources.Ram;
                    this.workers[ix].reservedRam -= t.resources.Ram;
                }
            })

            reservedWorkers = {};
        }
        return reservedWorkers;
    }

    /** @param {BatchJob} job */
    assignWorkersToJob(job) {
        this.logger.debug(`assignWorkersToJob(${job.target})`);
        let success = true;
        for (let task of job.executionPlan.tasks) {
            let ix = this.workers.findIndex((w) => w.freeRam >= task.resources.Ram);
            if (ix >= 0) {
                this.workers[ix].freeRam -= task.resources.Ram;
                this.workers[ix].reservedRam += task.resources.Ram;
                task.worker = this.workers[ix].hostname;
            } else {
                success = false;
                break;
            }
        }

        return success;
    }

    /** @param {BatchJob} job */
    releaseWorkers(job) {
        this.logger.debug(`releaseWorkers(${job.target})`);
        job.executionPlan.tasks.forEach((t) => {
            let ix = this.workers.findIndex((w) => w.hostname === t.worker);
            if (ix >= 0 ){
                this.workers[ix].freeRam += t.resources.Ram;
                this.workers[ix].reservedRam -= t.resources.Ram;
            }
        });
    }
}