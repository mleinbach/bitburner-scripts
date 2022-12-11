import { ExecutionPlan } from "./executionPlan";
import { Logger } from "./logger";
import { ExecError } from "./nsProcess";

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

        this.status = {Status: "NOTSTARTED", FinishTimes: []};
    }

    run() {
        //this.logger.debug(`run()`);
        this.executionPlan.tasks.sort((x, y) => x.startOrder - y.startOrder);
        try {
            this.executionPlan.tasks.forEach((x) => x.execute([x.delay]));
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
        this.status = {Status: "CANCELLED"}
    }

    getStatus() {
        //this.logger.debug(`getStatus()`);
        if (this.status.Status !== "RUNNING") {
            return this.status;
        }

        if (this.getRunningTasks() > 0) {
            return this.status;
        }

        this.executionPlan.tasks.sort((x, y) => x.finishTime - y.finishTime);
        var success = this.executionPlan.tasks.every((x, ix) => x.finishOrder == ix);
        if (success) {
            var finishTimes = this.executionPlan.tasks.map((x) =>  x.finishTime);
            this.status.Status = "SUCCESS";
            this.status.FinishTimes = finishTimes;
            return this.status;
        }
        return { Status: "FAILED"}
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
}
