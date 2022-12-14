import { ExecutionPlan } from "./executionPlan";
import { Logger } from "./logger";
import { ExecError } from "./nsProcess";
import { ports, TaskStatus } from "./constants";
import { timing } from "./config";

export class BatchJobStatus {
    static running = "RUNNING";
    static notStarted = "NOTSTARTED";
    static cancelled = "CANCELED";
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
        this.target = target;
        this.executionPlan = executionPlan;
        this.id = id;
        this.startTime = null;
        this.endTime = null;
        this.expectedEndTime = null;
        this.drift = 0;

        this.logger = new Logger(this.ns, `BatchJob-${this.target}-${this.id}`);

        this.status = BatchJobStatus.notStarted;
        this.hackingLevel = this.ns.getHackingLevel();
    }

    run() {
        this.logger.trace(`run()`);
        this.executionPlan.tasks.sort((x, y) => x.startOrder - y.startOrder);
        try {
            this.executionPlan.tasks.forEach((x) => x.execute([x.delay, x.duration, this.id, ports.BATCH_STATUS]));
            this.status = BatchJobStatus.running;
            this.startTime = Date.now();
            this.expectedEndTime = this.startTime + this.getBatchDuration();
        } catch (e) {
            this.logger.error(`Failed to start job:\n${e.stack}`);
            this.status = BatchJobStatus.failed;
            return false;
        }
        return true;
    }

    cancel() {
        this.logger.trace(`cancel()`);
        this.executionPlan.tasks.forEach((x) => x.cancel());
        this.status = BatchJobStatus.cancelled;
        this.endTime = Date.now();
    }

    getStatus() {
        this.logger.trace(`getStatus()`);
        if (this.status === BatchJobStatus.running) {
            if (this.executionPlan.tasks.some((t) => t.status === TaskStatus.CANCELLED)) {
                this.status = BatchJobStatus.cancelled;
                return this.status;
            }
            if(this.executionPlan.tasks.some((t) => t.status !== TaskStatus.COMPLETED)) {
                return this.status;
            }  
        }

        // get finish order rank because sometimes we modify the tasks array, so the following check will fail if using just finish order
        let endTimeRanks = this.executionPlan.tasks.sort(
            (x, y) => x.finishOrder - y.finishOrder).map((t, ix) => {return {endTime: t.endTime, finishOrderRank: ix}});

        let success = endTimeRanks.sort((x, y) => x.endTime - y.endTime).every((x, ix) => x.finishOrderRank === ix);
        this.status = success ? BatchJobStatus.success : BatchJobStatus.failed;
        this.endTime = this.executionPlan.tasks[this.executionPlan.tasks.length - 1].endTime;
        return this.status;
    }

    isOnSchedule() {
        let now = Date.now();
        let drift = now - this.expectedEndTime;
        this.drift = drift;
        // if (drift >= timing.batchTaskDelay) {
        //     let props = {
        //         id: this.id,
        //         startTime: new Date(this.startTime).toISOString(),
        //         expectedEndTime: new Date(this.expectedEndTime).toISOString(),
        //         now: new Date(now).toISOString(),
        //         drift: drift,
        //         expectedDuration: this.getBatchDuration()
        //     }
        //     this.logger.warn(`N${JSON.stringify(props, null, 2)}`);
        // }
        
        return drift < timing.batchTaskDelay;
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
