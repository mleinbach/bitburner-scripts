import { GrowTask, HackTask, WeakenTask } from "./task"
import { getWeakenThreads, getHackThreads, getGrowThreads } from "./hgwUtilities";

export class BatchJob {
    /**
     * @param {NS} ns
     * @param {String} target
     */
    constructor(ns, target, hackAmount, executionPlan) {
        this.ns = ns;
        this.target = target;
        this.hackAmount = hackAmount;
        this.executionPlan = executionPlan;

        this.status = {Status: "NOTSTARTED", FinishTimes: []};
    }

    run() {
        this.executionPlan.sort((x, y) => x.StartOrder - y.StartOrder);
        this.executionPlan.forEach((x) => x.Task.execute(worker, x.Resources.Threads, [x.Delay]));
        this.status.Status = "RUNNING";
    }

    cancel() {
        this.executionPlan.forEach((x) => x.Task.cancel());
        this.status = {Status: "CANCELLED"}
    }

    getStatus() {
        if (this.status.Status !== "RUNNING") {
            return this.status;
        }

        if (this.getRunningTasks() > 0) {
            return this.status;
        }

        this.executionPlan.sort((x, y) => x.FinishTime - y.FinishTime);
        var success = this.executionPlan.every((x, ix) => x.FinishOrder == ix);
        if (success) {
            var finishTimes = this.executionPlan.map((x) =>  x.FinishTime);
            this.status.Status = "SUCCESS";
            this.status.FinishTimes = finishTimes;
            return this.status;
        }
        return { Status: "FAILED"}
    }

    getRunningTasks() {
        return this.executionPlan.filter((x) => x.Task.isRunning()).length;
    }

    async waitForCompletion() {
        while(this.getStatus().Status === "RUNNING"){
            await this.ns.sleep(1000);
        }
    }

    #createExecutionPlan() {
        var hackTask = new HackTask(this.ns, this.target);
        var growTask = new GrowTask(this.ns, this.target);
        var weakenTask1 = new WeakenTask(this.ns, this.target);
        var weakenTask2 = new WeakenTask(this.ns, this.target);

        var plan = [
            {
                Name: "Hack",
                Task: hackTask,
                TaskDuration: hackTask.expectedDuration(),
                FinishOrder: 0,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Hack
            },
            {
                Name: "Weaken1",
                Task: weakenTask1,
                Duration: weakenTask1.expectedDuration(),
                FinishOrder: 1,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Weaken
            },
            {
                Name: "Grow",
                Task: growTask,
                Duration: growTask.expectedDuration(),
                FinishOrder: 2,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Grow
            },
            {
                Name: "Weaken2",
                Task: weakenTask2,
                Duration: weakenTask2.expectedDuration(),
                FinishOrder: 3,
                StartOrder: null,
                Delay: null,
                TotalDuration: null,
                Worker: null,
                Resources: this.resourceRequirements.Weaken
            }
        ]

        var longestTask = plan.reduce((x, y) => {
            if (y.Duration > x.Duration) {
                return y
            } else if (y.Duration < x.Duration) {
                return x
            }
            else {
                if (x.FinishOrder <= y.FinishOrder) {
                    return x
                }
                else {
                    return y
                }
            }
        })

        for (var task of plan) {
            var delay = (
                (longestTask.Duration - task.Duration)
                + (task.FinishOrder * timing.batchBetweenScriptDelay))
            // optionally: - (longest.FinishOrder * timing.batchBetweenScriptDelay)
            task.Delay = delay;
            task.TotalDuration = delay + task.Duration;
        }

        plan.sort((x, y) => {
            var res = x.Delay - y.Delay;
            if (res == 0) {
                res = x.FinishOrder - y.FinishOrder;
            }
            return res;
        })

        plan.forEach((x, ix) => x.StartOrder = ix);

        return plan;
    }

    /**
     * @param {String} server 
     * @param {Number} hackAmount 
     * @returns {any}
     */
    #getResourceRequirements() {
        const hackThreads = getHackThreads(ns, this.target, this.hackAmount);
        const growThreads = getGrowThreads(ns, this.target, this.hackAmount);
        const weakenThreads = getWeakenThreads(ns, this.target, this.hackAmount);

        return {
            "Hack": {
                "Threads": hackThreads,
                "Ram": getHackScriptRam(ns) * hackThreads
            },
            "Grow": {
                "Threads": growThreads,
                "Ram": getGrowScriptRam(ns) * growThreads
            },
            "Weaken": {
                "Threads": weakenThreads,
                "Ram": getGrowScriptRam(ns) * weakenThreads
            }
        };
    }

    getBatchDuration() {
        return this.executionPlan.reduce((x, y) => (x.TotalDuration - y.TotalDuration) > 0 ? x : y);
    }
}
