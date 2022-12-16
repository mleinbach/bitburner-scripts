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
    constructor(ns, target, maxBatches, hackAmount) {
        this.logger = new Logger(ns, `BatchRunner-${target}`);
        this.logger.disableNSLogs();
        this.logger.trace("new BatchRunner()")

        this.ns = ns;
        this.target = target;
        this.maxBatches = maxBatches;
        /** @type {typeof ExecutionPlanBuilder} */
        this.executionPlanBuilder = HWGWExecutionPlanBuilder;
        this.hackAmount = hackAmount;
        /** @type {BatchJob[]} */
        this.batches = [];
        this.needsReset = false;
        this.initializing = false;
        this.now = Date.now();
        this.timeSinceLastBatch = 0;
        this.lastBatch = null;
        this.nextBatchId = 0;
        this.succeededBatches = 0;
        this.failedBatches = 0;
    }

    getTimeSinceLastBatch() {
        let now = Date.now()
        this.timeSinceLastBatch += now - this.now;
        this.now = now;
        return this.timeSinceLastBatch;
    }

    /** @param {BatchJob} job */
    startBatch(job) {
        this.logger.trace(`startBatch(): ${job.id}`)
        this.timeSinceLastBatch = 0;
        let success = job.run();
        if (success) {
            this.batches.push(job);
        }
        return success;
    }

    cancelJobs() {
        this.batches.forEach((x) => {
            x.cancel();
        });
    }

    reset() {
        this.batches = [];
        this.needsReset = false;
        this.lastBatch = null;
    }

    /** 
     * @param {Number} hackAmount
     * @returns {ExecutionPlan} execution plan based on target server current attributes
     */
    getExecutionPlan(hackAmount = null) {
        this.logger.trace(`getExecutionPlan() ${hackAmount}`);
        hackAmount = hackAmount !== null ? hackAmount : this.hackAmount;
        return HWGWExecutionPlanBuilder.build(this.ns, this.target, hackAmount);
    }

    updateBatches() {
        this.batches = this.batches.filter((b) =>
            (b.getStatus() === BatchJobStatus.running)
            || (b.getStatus() === BatchJobStatus.notStarted));
    }

    getZombieBatches() {
        return this.batches.filter((b) =>
            (b.getStatus() === BatchJobStatus.running) && (b.getRunningTasks() <= 0));
    }

    getCompletedBatches() {
        return this.batches.filter((b) =>
            (b.getStatus() === BatchJobStatus.failed)
            || (b.getStatus() === BatchJobStatus.success)
            || (b.getStatus() === BatchJobStatus.canceled));
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

        let failed = false;
        let status = batch.getStatus();
        if (status === BatchJobStatus.failed) {
            this.logger.error(`tasks ran out of order`);
            this.failedBatches++;
            failed = true;
        } else if (status === BatchJobStatus.success) {
            if (this.lastBatch === null) {
                this.lastBatch = batch;
                this.succeededBatches++;
            } else {
                let lastBatchEndTime = this.lastBatch.executionPlan.tasks.map((t) => t.endTime).reduce((x, y) => x - y >= 0 ? x : y);
                let firstTaskEndTime = batch.executionPlan.tasks.map((t) => t.endTime).reduce((x, y) => x - y <= 0 ? x : y);
                if (lastBatchEndTime < firstTaskEndTime) {
                    this.logger.success(`batch ${batch.id} succeeded`);
                    this.lastBatch = batch;
                    this.checkTargetInitialization();
                    this.succeededBatches++;
                } else {

                    this.logger.error(`batches ran out of order: lastBatchId=${this.lastBatch.id} lastBatchEndTime=${lastBatchEndTime}, currentBatchId=${batch.id} firstTaskEndTime=${firstTaskEndTime}`);
                    this.failedBatches++;
                    failed = true;
                }
            }
        }

        if (failed && !this.checkTargetStatus()) {
            this.needsReset = true;
        }
    }

    checkTargetStatus() {
        return this.ns.getServerMaxMoney(this.target) <= this.ns.getServerMoneyAvailable(this.target)
            || this.ns.getServerMinSecurityLevel(this.target) >= this.ns.getServerSecurityLevel(this.target);
    }

    checkTargetInitialization() {
        if (this.initializing
            && (this.ns.getServerMaxMoney(this.target) <= this.ns.getServerMoneyAvailable(this.target)
                || this.ns.getServerMinSecurityLevel(this.target) >= this.ns.getServerSecurityLevel(this.target)
            )) {
            this.initializing = false;
        }
        return this.initializing;
    }

    getNextBatchId() {
        return this.nextBatchId++;
    }
}