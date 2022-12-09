import { HackTask, GrowTask, WeakenTask, MockTask } from "./task"
import { getHackScriptRam, getGrowScriptRam, getWeakenScriptRam } from "./hgwUtilities";
import { getGrowThreads, getHackThreads, getWeakenThreads } from "./hgwUtilities";
import { timing } from "./config";

export class ExecutionPlanBuilder  {
    /** 
     * @param {NS} ns
     * @param {String} target
     * @param {Number} hackAmount
     * @returns {ExecutionPlan} executionPlan
     */
    static build(ns, target, hackAmount) {
        throw "Not Implemented"
    }

    /**
     * @param {NS} ns
     */
    static getResourceRequirements(ns) {
        throw "Not Implemented"
    }
}

export class MockExecutionPlanBuilder extends ExecutionPlanBuilder {
    static build(ns, target, hackAmount) {
        let resourceRequirements = MockExecutionPlanBuilder.getResourceRequirements(ns);
        let plan = new ExecutionPlan(ns, resourceRequirements);
        plan.tasks.push(new MockTask(ns, 5000, 0, resourceRequirements.Mock));
        plan.tasks.push(new MockTask(ns, 10000, 1, resourceRequirements.Mock));
        plan.tasks.push(new MockTask(ns, 7000, 2, resourceRequirements.Mock));
        plan.tasks.push(new MockTask(ns, 10000, 3, resourceRequirements.Mock));
        plan.compile();
        return plan;
    }

    /**
     * @param {NS} ns
     */
    static getResourceRequirements(ns) {
        return {
            Mock: {
                Threads: 1,
                Ram: ns.getScriptRam("mock.js")
            }
        };
    }
}


export class HWGWExecutionPlanBuilder extends ExecutionPlanBuilder {
    static build(ns, target, hackAmount) {
        let resourceRequirements = HWGWExecutionPlanBuilder.getResourceRequirements(ns, target, hackAmount);
        let plan = new ExecutionPlan(ns, resourceRequirements);
        plan.tasks.push(new HackTask(ns, target, 0, resourceRequirements.Hack));
        plan.tasks.push(new WeakenTask(ns, target, 1, resourceRequirements.Weaken));
        plan.tasks.push(new GrowTask(ns, target, 2, resourceRequirements.Grow));
        plan.tasks.push(new WeakenTask(ns, target, 3, resourceRequirements.Weaken));
        plan.compile();
        return plan;
    }

    /**
     * @param {String} target 
     * @param {Number} hackAmount 
     * @returns {any}
     */
    static getResourceRequirements(ns, target, hackAmount) {
        const hackThreads = getHackThreads(this.ns, target, hackAmount);
        const growThreads = getGrowThreads(this.ns, target, hackAmount);
        const weakenThreads = getWeakenThreads(this.ns, target, hackAmount);

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
        this.ns = ns;
        this.resourceRequirements = resourceRequirements;
        this.tasks = [];
    }

    compile() {
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
                + (task.finishOrder * timing.batchBetweenScriptDelay))
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
        return this.tasks.map((x) => x.totalDuration()).reduce((x, y) => (x - y) > 0 ? x : y);
    }
}
