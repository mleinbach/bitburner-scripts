import { ExecutionPlan } from "./executionPlan";
import { Logger } from "./logger";
import { ExecError } from "./nsProcess";
import { ports } from "./constants";

export class BatchJobStatus {
    static running = "RUNNING";
    static notStarted = "NOTSTARTED";
    static canceled = "CANCELED";
    static failed = "FAILED";
    static success = "SUCCESS";

}

export class BatchJob {
    /**
     * @param {NS} ns
     * @param {String} target
     * @param {ExecutionPlan} executionPlan
     * @param {Number} id
     */
    constructor(ns, target, executionPlan, id) {
        this.ns = ns;
        this.logger = new Logger(this.ns, "BatchJob");
        this.target = target;
        this.executionPlan = executionPlan;
        this.id = id;
        this.startTime = null;
        this.endTime = null;

        this.status = BatchJobStatus.notStarted;
    }

    run() {
        this.logger.trace(`run()`);
        this.executionPlan.tasks.sort((x, y) => x.startOrder - y.startOrder);
        try {
            this.executionPlan.tasks.forEach((x) => x.execute([x.delay, this.id, ports.BATCH_STATUS]));
            this.status = BatchJobStatus.running;
            this.startTime = Date.now();
        } catch (e) {
            if (e instanceof ExecError) {
                this.logger.error(`Failed to start job:\n${e.stack}`);
                return false;
            }
        }
        return true;
    }

    cancel() {
        this.logger.trace(`cancel()`);
        this.executionPlan.tasks.forEach((x) => x.cancel());
        this.status = BatchJobStatus.canceled;
        this.endTime = Date.now();
    }

    getStatus() {
        this.logger.trace(`getStatus()`);
        if (!(this.status === BatchJobStatus.running && this.getRunningTasks() <= 0)) {
            return this.status;
        }

        this.executionPlan.tasks.sort((x, y) => x.endTime - y.endTime); 
        let success = this.executionPlan.tasks.every((x, ix) => x.finishOrder === ix);
        this.status = success ? BatchJobStatus.success : BatchJobStatus.failed;
        this.endTime = this.executionPlan.tasks[this.executionPlan.tasks.length-1].endTime;
        return this.status;
    }

    getRunningTasks() {
        this.logger.trace(`getRunningTasks()`);
        return this.executionPlan.tasks.filter((x) => x.isRunning()).length;
    }

    async waitForCompletion() {
        this.logger.trace(`waitForCompletion()`);
        while (this.getStatus() === BatchJobStatus.running) {
            await this.ns.sleep(1000);
        }
    }

    getBatchDuration() {
        return this.executionPlan.getDuration();
    }

    /**
     * @param {Number} number 
     * @returns {Task} task 
     */
    getTask(id) {
        return this.executionPlan.tasks.find((x) => x.id === id);
    }
}
