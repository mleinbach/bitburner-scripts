import { Task, HackTask, GrowTask, WeakenTask } from "./task"
import { getHackScriptRam, getGrowScriptRam, getWeakenScriptRam } from "./hgwUtilities";
import { getGrowThreads, getHackThreads, getWeakenThreads } from "./hgwUtilities";
import { timing } from "./config";
import { Logger } from "./logger";

export class ExecutionPlanBuilder  {
    /**
     * 
     * @param {NS} ns 
     * @param {String} target 
     * @param {Number} hackAmount 
     */
    constructor(ns, target, hackAmount) {
        this.logger = new Logger(ns, "ExecutionPlanBuilder");
        this.logger.disableNSLogs();
        this.logger.trace("ExecutionPlanBuilder()")
        this.ns = ns;
        this.target = target;
        this.hackAmount = hackAmount;
        this.resourceRequirements = this.getResourceRequirements();
    }

    build() {
        throw new Error("Not Implemented");
    }

    /**
     * @param {NS} ns
     */
    getResourceRequirements() {
        throw new Error("Not Implemented");
    }
}

export class HWGWExecutionPlanBuilder extends ExecutionPlanBuilder {
    build() {
        this.logger.trace(`build()`);
        let plan = new ExecutionPlan(this.ns, this.resourceRequirements);
        plan.tasks.push(new HackTask(this.ns, this.target, 0, this.resourceRequirements.Hack));
        plan.tasks.push(new WeakenTask(this.ns, this.target, 1, this.resourceRequirements.Weaken));
        plan.tasks.push(new GrowTask(this.ns, this.target, 2, this.resourceRequirements.Grow));
        plan.tasks.push(new WeakenTask(this.ns, this.target, 3, this.resourceRequirements.Weaken));
        plan.compile();
        return plan;
    }

    getResourceRequirements() {
        this.logger.trace(`getResourceRequirements()`);
        const hackThreads = getHackThreads(this.ns, this.target, this.hackAmount);
        const growThreads = getGrowThreads(this.ns, this.target, this.hackAmount);
        const weakenThreads = getWeakenThreads(this.ns, this.target, this.hackAmount);

        return {
            Hack: {
                Threads: hackThreads,
                Ram: getHackScriptRam(this.ns) * hackThreads
            },
            Grow: {
                Threads: growThreads,
                Ram: getGrowScriptRam(this.ns) * growThreads
            },
            Weaken: {
                Threads: weakenThreads,
                Ram: getWeakenScriptRam(this.ns) * weakenThreads
            }
        };
    }
}

export class ExecutionPlan {
    /** @param {NS} ns */
    constructor(ns, resourceRequirements) {
        this.logger = new Logger(ns, "ExecutionPlan");
        this.logger.trace("constructor()");
        this.ns = ns;
        this.resourceRequirements = resourceRequirements;
        /** @type {Task[]} */
        this.tasks = [];
    }

    compile() {
        this.logger.trace("compile()");
        var longestTask = this.tasks.reduce((x, y) => {
            if (y.duration > x.duration) {
                return y
            } else if (y.duration < x.duration) {
                return x
            }
            else {
                if (x.finishOrder <= y.finishOrder) {
                    return x
                }
                else {
                    return y
                }
            }
        })

        for (var task of this.tasks) {
            var delay = (
                (longestTask.duration - task.duration)
                + (task.finishOrder * timing.batchTaskDelay))
            // optionally: - (longest.FinishOrder * timing.batchBetweenScriptDelay)
            task.delay = delay;
        }

        this.tasks.sort((x, y) => {
            var res = x.delay - y.delay;
            if (res == 0) {
                res = x.finishOrder - y.finishOrder;
            }
            return res;
        })

        this.tasks.forEach((x, ix) => x.startOrder = ix);
    }

    /** @returns {Number} */
    getDuration() {
        this.logger.trace("getDuration()");
        return this.tasks.map((x) => x.totalDuration()).reduce((x, y) => (x - y) > 0 ? x : y);
    }
}
