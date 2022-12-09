import { getAllHackableServers, getAllRootedServers, getRoot } from "./utilities";
import { BatchJob } from "./job";
import { timing } from "./config";
import { NSProcess } from "./nsProcess";

export class Scheduler {
    /** @param {NS} ns */
    constructor(ns) {
        this.ns = ns;
        this.batchRunners = [];
        this.workers = [];
        this.hackableServers = [];
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
                let templateJob = new BatchJob(this.ns, target, 0.10);
                const maxBatches = templateJob.getBatchDuration() / (templateJob.executionPlan.length * timing.batchBetweenScriptDelay);
                
                // allocate workers for batches
                let reservedWorkers = {
                    Hack: [],
                    Grow: [],
                    Weaken1: [],
                    Weaken2: []
                };
                for (let i = 0; i < maxBatches; i++){
                    let jobWorkers = this.reserveWorkers(job);
                    reservedWorkers.Hack.push(...jobWorkers.Hack);
                    reservedWorkers.Grow.push(...jobWorkers.Grow);
                    reservedWorkers.Weaken1.push(...jobWorkers.Weaken1);
                    reservedWorkers.Weaken2.push(...jobWorkers.Weaken2);
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
            let job = new BatchJob(this.ns, target, hackAmount);
            // use only grow/weaken part of batch
            job.executionPlan = job.executionPlan.filter((x) => x.FinishOrder > 1);
            this.assignWorkersToJob(job);
            job.run();
            await job.waitForCompletion();
            this.releaseWorkers(job);
        }
    }

    /** @param {BatchJob} job */
    reserveWorkers(job) {
        let reservedWorkers = {
            Hack: [],
            Grow: [],
            Weaken1: [],
            Weaken2: []
        }
        job.executionPlan.forEach((x) => {
            let ix = this.workers.findIndex((y) => y.FreeRam >= x.Resources.Ram);
            this.workers[ix].freeRam -= x.Resources.Ram;
            this.workers[ix].reservedRam += x.Resources.Ram;
            
            reservedWorkers[x.Name].push(this.workers[ix].hostname);
        })
        return workers;
    }

    /** @param {BatchJob} job */
    assignWorkersToJob(job) {
        job.executionPlan.forEach((x) => {
            let ix = this.workers.findIndex((y) => y.FreeRam >= x.Resources.Ram);
            this.workers[ix].freeRam -= x.Resources.Ram;
            this.workers[ix].reservedRam += x.Resources.Ram;
            x.Worker = this.workers[ix].hostname;
        });
    }

    /** @param {BatchJob} job */
    releaseWorkers(job) {
        job.executionPlan.forEach((x) => {
            let ix = this.workers.findIndex((y) => y.hostname === x.Worker);
            this.workers[ix].freeRam += x.Resources.Ram;
            this.workers[ix].reservedRam -= x.Resources.Ram;
        });
    }
}