import { timing } from "./config";
import { ExecutionPlanBuilder } from "./executionPlan";
import { BatchJob, BatchJobStatus } from "./job";
import { Logger } from "./logger";
import { ports, EMPTY_PORT } from "./constants"

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
        this.logger.trace("constructor()")

        this.ns = ns;
        this.target = target;
        this.maxBatches = maxBatches;
        this.workers = workers;
        this.executionPlanBuilder = executionPlanBuilder;
        this.hackAmount = 0.10;
        this.portHandle = ns.getPortHandle(ports.BATCH_STATUS);
        this.batches = [];
        this.needsReset = false;
        this.lastBatchEndTime = 0;
        this.updateInterval = 50; //ms
        this.now = Date.now();
        this.timeSinceLastBatch = 0;
        this.nextBatchId = 0;
    }

    async run() {
        this.logger.trace("run()")
        this.portHandle.clear();

        while (true) {
            let now = Date.now();
            this.timeSinceLastBatch += (now - this.now);
            this.now = now;

            // check completed batches for failures
            this.checkBatchStatus()

            // reset if failure detected
            if (this.needsReset) {
                await this.reset();
            } else { // otherwise update tracked batches
                this.batches = this.batches.filter((b) => b.status === BatchJobStatus.running);
            }

            //TODO: clean up
            if ((this.timeSinceLastBatch >= (3 * timing.batchBetweenScriptDelay))
                && (this.batches.length < this.maxBatches)) {
                this.startNewBatch();
            }

            await this.ns.sleep(this.updateInterval);
        }
    }

    async reset() {
        this.logger.trace("reset()")
        this.batches.forEach((x) => {
            x.cancel();
            this.releaseWorkers(x);
        });

        let minSecurity = this.ns.getServerMinSecurityLevel(this.target);
        let maxMoney = this.ns.getServerMaxMoney(this.target);
        let hackAmount = maxMoney / (maxMoney - this.ns.getServerMoneyAvailable(this.target));
        hackAmount = Math.ceil((hackAmount + Number.EPSILON) * 100) / 100;
        while (this.ns.getServerSecurityLevel(this.target) > minSecurity || this.ns.getServerMoneyAvailable(this.target) < maxMoney) {
            let executionPlan = this.executionPlanBuilder.build(this.ns, this.target, hackAmount);
            let job = new BatchJob(this.ns, this.target, executionPlan);
            // use only grow/weaken part of batch
            job.executionPlan.tasks = job.executionPlan.tasks.filter((x) => x.finishOrder > 1);
            this.assignWorkersToJob(job);
            job.run();
            await job.waitForCompletion();
            this.releaseWorkers(job);
        }
        this.batches = [];
        this.needsReset = false;
        this.lastBatchEndTime = 0;
        this.portHandle.clear();
    }

    startNewBatch() {
        this.logger.trace("startNewBatch()");
        let executionPlan = this.executionPlanBuilder.build(this.ns, this.target, this.hackAmount);
        let job = new BatchJob(this.ns, this.target, executionPlan, this.nextBatchId);
        this.nextBatchId++;
        if (!this.assignWorkersToJob(job)) {
            this.logger.warn("no workers available for batch");
            this.releaseWorkers(job);
        }
        if (job.run()) {
            this.batches.push(job);
            this.logger.debug(`Started new batch; runningBatches=${this.batches.length}`);
        } else {
            this.logger.warn("Job failed to start");
            this.releaseWorkers(job);
        }
        this.timeSinceLastBatch = 0;
    }
    


    /** 
     * @param {BatchJob} job 
     * {
     *  "Task": {
     *      "Worker": 1
     *   }
     * }
    */
    assignWorkersToJob(job) {
        this.logger.trace("assignWorkersToJob()");
        let success = true;
        for (let task of job.executionPlan.tasks) {
            for (const w in this.workers[task.name]) {
                if (this.workers[task.name][w] > 0) {
                    task.worker = w;
                    this.workers[task.name][w]--;
                }
            }

            if (task.worker === null) {
                success = false;
                break;
            }
        }
        return success;
    }

    /** @param {BatchJob} job */
    releaseWorkers(job) {
        this.logger.trace("releaseWorkers()");
        for (let task of job.executionPlan.tasks) {
            this.workers[task.name][task.worker]++;
            task.worker = null;
        }
    }

    checkBatchStatus() {
        this.logger.trace("checkBatchStatus()");
        while (this.portHandle.peek() !== EMPTY_PORT) {
            // get task finished data from port
            let portData = JSON.parse(this.portHandle.read());
            this.logger.debug(`portData=${JSON.stringify(portData)}`)

            // find associated batch
            let ix = this.batches.findIndex((x) => x.id === portData.batchId)
            this.logger.debug(`ix=${ix}`)
            if (ix < 0) {
                this.logger.warn(`recieved task data for unknown batch`);
                continue;
            }

            // update the task
            let batch = this.batches[ix]
            let task = batch.getTask(portData.id)
            task.startTime = portData.startTime;
            task.endTime = portData.endTime;

            // evaluate batch status
            // We don't actually know the order in which the batch that is associated with the task port data executed.
            // Despite that, the following logic should evaluate batches more or less in order as long as the update interval is
            // less than the task delay time.
            // We will be pulling from this port faster than the tasks will be pushing, therefore we will evaluate tasks in order.
            // As long as the task timing logic is correct, it should follow that batches will be evaluated in order.
            let status = batch.getStatus();
            if (status === BatchJobStatus.failed) {
                this.logger.error(`tasks ran out of order`);
                this.needsReset = true;
            } else if (status === BatchJobStatus.success) {
                let firstTaskEndTime = batch.executionPlan.tasks.map((t) => t.endTime).reduce((x, y) => x - y <= 0 ? x : y);
                if (this.lastBatchEndTime < firstTaskEndTime) {
                    this.logger.success(`batch ${batch.id} succeeded`);
                    this.lastBatchEndTime = batch.endTime;
                    this.releaseWorkers(batch);
                } else {
                    this.logger.error(`batches ran out of order`);
                    this.needsReset = true;
                }
            }

            if (this.needsReset) {
                break;
            }
        }
    }
}