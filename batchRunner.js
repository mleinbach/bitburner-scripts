import { HWGWExecutionPlan } from "./executionPlan";
import { BatchJob } from "./job";

export class BatchRunner {
    /**
     * @param {NS} ns
     * @param {String} target
     * @param {Number} maxBatches
     * @param {any} workers
     * @param {HWGWExecutionPlan} executionPlan
     */
    constructor(ns, target, maxBatches, workers, executionPlan) {
        this.ns = ns;
        this.target = target;
        this.maxBatches = maxBatches;
        this.workers = workers;
        this.executionPlan = executionPlan;
        this.batches = [];
        this.needsReset = false;
        this.hackAmount = 0.10;
        this.lastBatchStatus = {
            Status: "N/A",
            FinishTimes: [0, 0, 0, 0]
        }
    }

    async run() {
        while(true) {
            // check completed batches for failures
            var runningBatches = [];
            for(var batch of this.batches) {
                var batchStatus = batch.getStatus();
                
                if (batchStatus.Status === "FAILED") {
                    this.needsReset = true;
                } else if (batchStatus.Status === "SUCCESS"){
                    var lastTaskTime = this.lastBatchStatus.FinishTimes.reduce((x, y) => x - y >= 0 ? x : y);
                    var firstTaskTime = batchStatus.FinishTimes.reduce((x, y) => x - y <= 0 ? x : y);
                    if (lastTaskTime < firstTaskTime) {
                        this.lastBatchStatus = batchStatus;
                        this.releaseWorkers(batch);
                    } else {
                        this.needsReset = true;
                    }
                } else {
                    runningBatches.push(batch);
                }
            }

            // reset if failure detected
            if (this.needsReset) {
                await this.reset();
            }

            this.batches = runningBatches;

            if (this.batches.length < this.maxBatches) {
                var job = new BatchJob(this.ns, this.target, this.hackAmount, this.executionPlan)
                this.assignWorkersToJob(job);
                job.run();
            }

            await this.ns.sleep(100);
        }
    }

    async reset() {
        this.batches.forEach((x) => {
            x.cancel();
            this.releaseWorkers(x);
        });
        this.batches = [];

        var minSecurity = this.ns.getServerMinSecurityLevel();
        var maxMoney = this.ns.getServerMaxMoney();

        while(this.ns.getServerSecurityLevel(this.target) > minSecurity && this.ns.getServerMoneyAvailable(this.target) < maxMoney){
            var job = new BatchJob(this.ns, this.target, this.hackAmount);
            // use only grow/weaken part of batch
            job.executionPlan.tasks = job.executionPlan.tasks.filter((x) => x.FinishOrder > 1);
            this.assignWorkersToJob(job);
            job.run();
            await job.waitForCompletion();
            this.releaseWorkers(job);
        }
    }

    /** @param {BatchJob} job */
    assignWorkersToJob(job) {
        job.executionPlan.tasks.forEach((x) => {
            x.Worker = this.workers[x.Name].shift();
        })
    }

    /** @param {BatchJob} job */
    releaseWorkers(job){
        job.executionPlan.tasks.forEach((x) => {
            this.workers[x.Name].push(x.Worker);
            x.Worker=null;
        });
    }
}