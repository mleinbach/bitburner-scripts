import { HWGWExecutionPlan } from "./executionPlan";

export class BatchJob {
    /**
     * @param {NS} ns
     * @param {String} target
     * @param {Number} hackAmount
     * @param {HWGWExecutionPlan} executionPlan
     */
    constructor(ns, target, hackAmount, executionPlan) {
        this.ns = ns;
        this.target = target;
        this.hackAmount = hackAmount;
        this.executionPlan = executionPlan;

        this.status = {Status: "NOTSTARTED", FinishTimes: []};
    }

    run() {
        this.executionPlan.tasks.sort((x, y) => x.startOrder - y.startOrder);
        this.executionPlan.tasks.forEach((x) => x.execute(worker, x.resources.Threads, [x.delay]));
        this.status.Status = "RUNNING";
    }

    cancel() {
        this.executionPlan.tasks.forEach((x) => x.cancel());
        this.status = {Status: "CANCELLED"}
    }

    getStatus() {
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
        return this.executionPlan.tasks.filter((x) => x.isRunning()).length;
    }

    async waitForCompletion() {
        while(this.getStatus().Status === "RUNNING"){
            await this.ns.sleep(1000);
        }
    }

    getBatchDuration() {
        return this.executionPlan.getDuration();
    }
}
