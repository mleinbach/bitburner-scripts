import { ExecutionPlanBuilder, HWGWExecutionPlanBuilder } from "./executionPlan";
import { ExecutionPlan } from "./executionPlan";
import { BatchJob, BatchJobStatus } from "./job";
import { Logger } from "./logger";
import { timing } from "./config";

export class BatchRunner {
    /**
     * @param {NS} ns
     * @param {String} target
     * @param {Number} maxBatches
     * @param {any} workers
     */
    constructor(ns, target, maxBatches, workers, hackAmount) {
        this.logger = new Logger(ns, `BatchRunner-${target}`);
        this.logger.disableNSLogs();
        this.logger.trace("new BatchRunner()")

        this.ns = ns;
        this.target = target;
        this.maxBatches = maxBatches;
        this.workerSlots = workers;
        /** @type {typeof ExecutionPlanBuilder} */
        this.executionPlanBuilder = HWGWExecutionPlanBuilder;
        this.hackAmount = hackAmount;
        /** @type {BatchJob[]} */
        this.batches = [];
        this.needsReset = false;
        this.initializing = false;
        this.now = Date.now();
        this.timeSinceLastBatch = 0;
        this.lastBatchEndTime = 0;
        this.nextBatchId = 0;
    }

    reset() {
        this.logger.trace("reset()")
        this.batches.forEach((x) => {
            x.cancel();
            this.releaseWorkers(x);
        });
        this.batches = [];
        this.needsReset = false;
        this.lastBatchEndTime = 0;

        this.initializeTarget();
    }

    /** @returns {ExecutionPlan} execution plan based on target server current attributes */
    getExecutionPlan() {
        return this.executionPlanBuilder.build(this.ns, this.target, this.hackAmount);
    }

    initializeTarget() {
        this.initializing = true;

        let hackAmount = maxMoney / (maxMoney - this.ns.getServerMoneyAvailable(this.target));
        hackAmount = Math.ceil((hackAmount + Number.EPSILON) * 100) / 100;

        let executionPlan = this.executionPlanBuilder.build(this.ns, this.target, hackAmount);
        let job = new BatchJob(this.ns, this.target, executionPlan, -1);

        let success = this.assignWorkersToJob(job);
        if (success) {
            success = job.run();
        }
        if (success) {
            this.batches.push(job);
        } else {
            throw new Error(`failed to initilialize target=${this.target}`);
        }
    }

    startNewBatch() {
        this.logger.trace("startNewBatch()");
        let now = Date.now();
        this.timeSinceLastBatch += now - this.now;
        this.now = now;

        if (this.initializing
            || (this.timeSinceLastBatch < timing.newBatchDelay)
            || (this.batches.length >= this.maxBatches)
        ) {
            return;
        }

        let executionPlan = this.getExecutionPlan();
        let job = new BatchJob(this.ns, this.target, executionPlan, this.nextBatchId);
        this.nextBatchId++;

        let success = this.assignWorkersToJob(job);
        if (success) {
            success = job.run();
        }
        if (success) {
            this.batches.push(job);
        } else {
            this.logger.warn("Job failed to start");
            this.releaseWorkers(job);
        }

        this.timeSinceLastBatch = 0;
    }

    /** @param {BatchJob} job */
    assignWorkersToJob(job) {
        this.logger.trace("assignWorkersToJob()");
        let success = true;
        for (let task of job.executionPlan.tasks) {
            for (const w in this.workerSlots[task.name]) {
                if (this.workerSlots[task.name][w].slots > 0) {
                    task.worker = w;
                    this.workerSlots[task.name][w].slots--;
                    break;
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
            if (task.worker !== null) {
                this.workerSlots[task.name][task.worker].slots++;
            }
            task.worker = null;
        }
    }

    updateBatches() {
        this.batches = this.batches.filter((b) => (b.getStatus() === BatchJobStatus.running) || (b.getStatus() === BatchJobStatus.notStarted));
    }

    updateBatchStatus(portData) {
        this.logger.trace(`updateBatch() - portData=${JSON.stringify(portData)}`)

        let ix = this.batches.findIndex((x) => x.id === portData.batchId);
        if (ix < 0) {
            this.logger.warn(`recieved task data for unknown batch`);
            return;
        }

        let batch = this.batches[ix];
        let task = batch.getTask(portData.id);
        task.startTime = portData.startTime;
        task.endTime = portData.endTime;

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
                this.checkTargetInitilization();
            } else {
                this.logger.error(`batches ran out of order: lastBatchEndTime=${this.lastBatchEndTime}, firstTaskEndTime=${firstTaskEndTime}`);
                this.needsReset = true;
            }
        }
    }

    checkTargetInitilization() {
        if (this.initializing
            && (this.ns.getServerMaxMoney(this.target) <= this.ns.getServerMoneyAvailable(this.target)
                || this.ns.getServerMinSecurityLevel(this.target) >= this.ns.getServerSecurityLevel(this.target)
        )) {
            this.initializing = false;
        }
    }
}