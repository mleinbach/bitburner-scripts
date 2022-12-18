import { Task, HackTask, GrowTask, WeakenTask } from "./task"
import { getHackScriptRam, getGrowScriptRam, getWeakenScriptRam } from "./hgwUtilities";
import { getGrowThreads, getHackThreads, getWeakenThreads } from "./hgwUtilities";
import { timing } from "./config";
import { Logger } from "./logger";

export class ExecutionPlanBuilder {
    /**
     * 
     * @param {NS} ns 
     * @param {String} target 
     * @param {Number} hackAmount 
     */
    static build(ns, target, hackAmount) {
        throw new Error("Not Implemented");
    }

    /**
     * 
     * @param {NS} ns 
     * @param {String} target 
     * @param {Number} hackAmount 
     */
    static getResourceRequirements(ns, target, hackAmount) {
        throw new Error("Not Implemented");
    }
}

/**
 * 
 * @param {NS} ns 
 * @param {String} target 
 * @param {Number} hackAmount 
 */
export class HWGWExecutionPlanBuilder extends ExecutionPlanBuilder {
    static build(ns, target, hackAmount) {
        new Logger(ns, "HWGWExecutionPlanBuilder").trace(`build() ${ns}, ${target}, ${hackAmount}`);
        let requirements = HWGWExecutionPlanBuilder.getResourceRequirements(ns, target, hackAmount);
        let plan = new ExecutionPlan(ns, requirements);
        plan.tasks.push(new HackTask(ns, target, 0, requirements.Hack));
        plan.tasks.push(new WeakenTask(ns, target, 1, requirements.Weaken));
        plan.tasks.push(new GrowTask(ns, target, 2, requirements.Grow));
        plan.tasks.push(new WeakenTask(ns, target, 3, requirements.Weaken));
        plan.compile();
        return plan;
    }

    static getResourceRequirements(ns, target, hackAmount) {
        new Logger(ns, "HWGWExecutionPlanBuilder").trace(`getResourceRequirements() ${ns}, ${target}, ${hackAmount}`);
        const hackThreads = getHackThreads(ns, target, hackAmount);
        const growThreads = getGrowThreads(ns, target, hackAmount);
        const weakenThreads = getWeakenThreads(ns, target, hackAmount);

        return {
            Hack: {
                Threads: hackThreads,
                Ram: getHackScriptRam(ns) * hackThreads
            },
            Grow: {
                Threads: growThreads,
                Ram: getGrowScriptRam(ns) * growThreads
            },
            Weaken: {
                Threads: weakenThreads,
                Ram: getWeakenScriptRam(ns) * weakenThreads
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
