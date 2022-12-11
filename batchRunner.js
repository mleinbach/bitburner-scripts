import { timing } from "./config";
import { ExecutionPlanBuilder } from "./executionPlan";
import { BatchJob } from "./job";
import { Logger } from "./logger";

export class BatchRunner {
    /**
     * @param {NS} ns
     * @param {String} target
     * @param {Number} maxBatches
     * @param {any} workers
     * @param {typeof ExecutionPlanBuilder} executionPlanBuilder
     */
    constructor(ns, target, maxBatches, workers, hackAmount, executionPlanBuilder) {
        this.logger = new Logger(ns, "BatchRunner");
        this.logger.disableNSLogs();
        this.logger.debug("constructor()")

        this.ns = ns;
        this.target = target;
        this.maxBatches = maxBatches;
        this.workers = workers;
        this.hackAmount = hackAmount;
        this.executionPlanBuilder = executionPlanBuilder;
        this.batches = [];
        this.needsReset = false;
        this.lastBatchStatus = {
            Status: "N/A",
            FinishTimes: [0, 0, 0, 0]
        }
        this.updateInterval = 50; //ms
        this.cycles = 0;
    }

    async run() {
        this.logger.debug("run()")
        while (true) {

            // check completed batches for failures
            let runningBatches = [];
            for (var batch of this.batches) {
                let batchStatus = batch.getStatus();

                if (batchStatus.Status === "FAILED") {
                    this.logger.error(`tasks ran out of order`);
                    this.needsReset = true;
                } else if (batchStatus.Status === "SUCCESS") {
                    let lastTaskTime = this.lastBatchStatus.FinishTimes.reduce((x, y) => x - y >= 0 ? x : y);
                    let firstTaskTime = batchStatus.FinishTimes.reduce((x, y) => x - y <= 0 ? x : y);
                    if (lastTaskTime < firstTaskTime) {
                        this.lastBatchStatus = batchStatus;
                        this.releaseWorkers(batch);
                        this.logger.success(`batch succeeded`);
                    } else {
                        this.logger.error(`batches ran out of order`);
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
            else {
                this.batches = runningBatches;
            }

            //TODO: clean up
            if (((this.cycles * this.updateInterval) >= 3 * timing.batchBetweenScriptDelay)
                && (this.batches.length < this.maxBatches)) {
                let executionPlan = this.executionPlanBuilder.build(this.ns, this.target, this.hackAmount);
                let job = new BatchJob(this.ns, this.target, this.hackAmount, executionPlan)
                if (!this.assignWorkersToJob(job)) {
                    this.logger.warn("no workers available for batch");
                    this.releaseWorkers(job);
                }
                if(job.run()) {
                    this.logger.debug(`Started new batch; runningBatches=${this.batches.length}`);
                    this.batches.push(job);
                } else {
                    this.logger.warn("Job failed to start");
                    this.releaseWorkers(job);
                }
                this.cycles = 0;
            }
            else {
                this.cycles++;
            }

            await this.ns.sleep(this.updateInterval);
        }
    }

    async reset() {
        this.logger.debug("reset()")
        this.batches.forEach((x) => {
            x.cancel();
            this.releaseWorkers(x);
        });
        this.batches = [];

        let minSecurity = this.ns.getServerMinSecurityLevel(this.target);
        let maxMoney = this.ns.getServerMaxMoney(this.target);
        let hackAmount = maxMoney / (maxMoney - this.ns.getServerMoneyAvailable(this.target));
        hackAmount = Math.ceil((hackAmount + Number.EPSILON) * 100) / 100;
        while (this.ns.getServerSecurityLevel(this.target) > minSecurity || this.ns.getServerMoneyAvailable(this.target) < maxMoney){
            let executionPlan = this.executionPlanBuilder.build(this.ns, this.target, hackAmount);
            let job = new BatchJob(this.ns, this.target, hackAmount, executionPlan);
            // use only grow/weaken part of batch
            job.executionPlan.tasks = job.executionPlan.tasks.filter((x) => x.finishOrder > 1);
            this.assignWorkersToJob(job);
            job.run();
            await job.waitForCompletion();
            this.releaseWorkers(job);
        }
        this.needsReset = false;
    }

    /** @param {BatchJob} job */
    assignWorkersToJob(job) {
        this.logger.debug("assignWorkersToJob()");
        let success = true;
        for (let task of job.executionPlan.tasks) {
            if (this.workers[task.name].length == 0) {
                success = false;
                break;
            }
            task.worker = this.workers[task.name].shift();
        }
        return success;
    }

    /** @param {BatchJob} job */
    releaseWorkers(job) {
        this.logger.debug("releaseWorkers()");
        for (let task of job.executionPlan.tasks) {
            if (task.worker !== null) {
                this.workers[task.name].push(task.worker);
            }
        }
    }
}