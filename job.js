import { ExecutionPlan } from "./executionPlan";
import { Logger } from "./logger";
import { ExecError } from "./nsProcess";
import { ports } from "./constants";

export class BatchJob {
    /**
     * @param {NS} ns
     * @param {String} target
     * @param {Number} hackAmount
     * @param {ExecutionPlan} executionPlan
     */
    constructor(ns, target, hackAmount, executionPlan) {
        this.ns = ns;
        this.logger = new Logger(this.ns, "BatchJob");
        this.target = target;
        this.hackAmount = hackAmount;
        this.executionPlan = executionPlan;

        this.status = {code: "NOTSTARTED", endTimes: []};
    }

    run() {
        //this.logger.debug(`run()`);
        this.executionPlan.tasks.sort((x, y) => x.startOrder - y.startOrder);
        try {
            this.executionPlan.tasks.forEach((x) => x.execute([x.delay, x.finishOrder, this.id, ports.BATCH_STATUS ]));
            this.status.Status = "RUNNING";
        } catch(e) {
            if (e instanceof ExecError){
                return false;
            }
        }
        return true;
    }

    cancel() {
        //this.logger.debug(`cancel()`);
        this.executionPlan.tasks.forEach((x) => x.cancel());
        this.status = {code: "CANCELLED"}
    }

    getStatus() {
        //this.logger.debug(`getStatus()`);
        if (this.status.Status !== "RUNNING") {
            return this.status;
        }

        if (this.getRunningTasks() > 0) {
            return this.status;
        }

        this.executionPlan.tasks.sort((x, y) => x.endTime - y.endTime);
        let success = this.executionPlan.tasks.every((x, ix) => x.finishOrder == ix);
        if (success) {
            let endTimes = this.executionPlan.tasks.map((x) =>  x.endTime);
            this.status.code = "SUCCESS";
            this.status.endTimes = endTimes;
            return this.status;
        }
        return { code: "FAILED"}
    }

    getRunningTasks() {
        //this.logger.debug(`getRunningTasks()`);
        return this.executionPlan.tasks.filter((x) => x.isRunning()).length;
    }

    async waitForCompletion() {
        //this.logger.debug(`waitForCompletion()`);
        while(this.getStatus().Status === "RUNNING"){
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
