import { getAllHackableServers, getAllRootedServers, getRoot } from "./utilities";
import { BatchJob } from "./job";
import { timing } from "./config";
import { NSProcess } from "./nsProcess";
import { ExecutionPlan, ExecutionPlanBuilder } from "./executionPlan";

export class Scheduler {
    /** 
     * @param {NS} ns
     * @param {typeof ExecutionPlanBuilder} executionPlanBuilder 
     */
    constructor(ns, executionPlanBuilder) {
        this.ns = ns;
        this.executionPlanBuilder = executionPlanBuilder;
        this.batchRunners = [];
        this.workers = [];
        this.hackableServers = [];
        this.hackAmount = 0.10;
    }

    async run() {
        while (true) {
            this.updateWorkers();
            this.updateHackableServers();

            let untargetedServers = hackableServers.filter((s) => batchRunners.findIndex((x) => x.target === s) == -1);
            if (untargetedServers.length > 0) {
                let target = untargetedServers.shift();
                await this.initializeServer(target);

                // create example batch job for requirements info
                let executionPlan = this.executionPlanBuilder.build(this.ns, target, this.hackAmount);
                const maxBatches = executionPlan.getDuration() / (executionPlan.tasks.length * timing.batchBetweenScriptDelay);
                
                // allocate workers for batches
                let reservedWorkers = {};
                for (let i = 0; i < maxBatches; i++){
                    let jobWorkers = this.reserveWorkers(executionPlan);
                    for (key in jobWorkers) {
                        if (!reservedWorkers.hasOwnProperty(key)){
                            reservedWorkers[key] = [];
                        }
                        reservedWorkers[key].push(...jobWorkers[key])
                    }
                }

                // register new batchRunner process
                let batchRunnerArgs = [maxBatches, reservedWorkers]
                let batchRunner = new NSProcess(this.ns, target, "batchRunnerService.js");
                this.batchRunners.push(batchRunner);

                // launch batchRunner
                batchRunner.execute("home", args=batchRunnerArgs);
            }
        }
    }

    updateWorkers() {
        getAllRootedServers(this.ns).map((s) => {
            let maxRam = this.ns.getServerMaxRam(s)
            return {
                hostname: s,
                maxRam: maxRam,
                freeRam: maxRam,
                reservedRam: 0
            }
        }).forEach((w) => {
            if (this.workers.findIndex((x) => x.hostname === w.hostname) < 0) {
                this.workers.push(w);
            }
        })
    }

    updateHackableServers() {
        getAllHackableServers(this.ns).forEach((s) => {
            getRoot(ns, s)
            if (this.hackableServers.findIndex((x) => x.hostname === s.hostname) < 0) {
                this.hackableServers.push(w);
            }
        })
    }

    /** @param {String} target */
    async initializeServer(target) {
        const minSecurity = this.ns.getServerMinSecurityLevel();
        const maxMoney = this.ns.getServerMaxMoney();
        let hackAmount = maxMoney / (maxMoney - this.getServerMoneyAvailable());
        hackAmount = Math.ceil((hackAmount + Number.EPSILON) * 100) / 100;

        while(this.ns.getServerSecurityLevel(target) > minSecurity && this.ns.getServerMoneyAvailable(target) < maxMoney){
            let executionPlan = this.executionPlanBuilder.build(ns, target, this.hackAmount);
            let job = new BatchJob(this.ns, target, hackAmount, executionPlan);
            // use only grow/weaken part of batch
            job.executionPlan.tasks = job.executionPlan.tasks.filter((x) => x.FinishOrder > 1);
            this.assignWorkersToJob(job);
            job.run();
            await job.waitForCompletion();
            this.releaseWorkers(job);
        }
    }

    /** @param {ExecutionPlan} executionPlan */
    reserveWorkers(executionPlan) {
        let reservedWorkers = {};
        executionPlan.tasks.forEach((x) => {
            let ix = this.workers.findIndex((y) => y.FreeRam >= x.Resources.Ram);
            this.workers[ix].freeRam -= x.Resources.Ram;
            this.workers[ix].reservedRam += x.Resources.Ram;
            
            reservedWorkers[x.Name].push(this.workers[ix].hostname);
        })
        return workers;
    }

    /** @param {BatchJob} job */
    assignWorkersToJob(job) {
        job.executionPlan.tasks.forEach((x) => {
            let ix = this.workers.findIndex((y) => y.FreeRam >= x.Resources.Ram);
            this.workers[ix].freeRam -= x.Resources.Ram;
            this.workers[ix].reservedRam += x.Resources.Ram;
            x.Worker = this.workers[ix].hostname;
        });
    }

    /** @param {BatchJob} job */
    releaseWorkers(job) {
        job.executionPlan.tasks.forEach((x) => {
            let ix = this.workers.findIndex((y) => y.hostname === x.Worker);
            this.workers[ix].freeRam += x.Resources.Ram;
            this.workers[ix].reservedRam -= x.Resources.Ram;
        });
    }
}