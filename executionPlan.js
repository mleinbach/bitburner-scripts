import { Task, HackTask, GrowTask, WeakenTask } from "./task"
import { getHackScriptRam, getGrowScriptRam, getWeakenScriptRam } from "./hgwUtilities";
import { getGrowThreads, getHackThreads, getWeakenThreads } from "./hgwUtilities";
import { weakenAnalyzeThreads, getGrowSecurity } from "./hgwUtilities";
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

export class HWGWExecutionPlanBuilder extends ExecutionPlanBuilder {
    /**
     * 
     * @param {NS} ns 
     * @param {String} target 
     * @param {Number} hackAmount 
     */
    static build(ns, target, hackAmount) {
        new Logger(ns, "HWGWExecutionPlanBuilder").trace(`build() ${ns}, ${target}, ${hackAmount}`);
        let requirements = HWGWExecutionPlanBuilder.getResourceRequirements(ns, target, hackAmount);
        let plan = new ExecutionPlan(ns);
        plan.tasks.push(new HackTask(ns, target, 0, requirements.Hack));
        plan.tasks.push(new WeakenTask(ns, target, 1, requirements.Weaken));
        plan.tasks.push(new GrowTask(ns, target, 2, requirements.Grow));
        plan.tasks.push(new WeakenTask(ns, target, 3, requirements.Weaken));
        plan.compile();
        return plan;
    }

    static buildInitializePlan(ns, target, hackAmount) {
        new Logger(ns, "HWGWExecutionPlanBuilder").trace(`build() ${ns}, ${target}, ${hackAmount}`);
        let requirements = HWGWExecutionPlanBuilder.getResourceRequirements(ns, target, hackAmount);

        // Add threads needed to mitigate growth security increase to the amount of threads
        // needed to weaken security to min from current level.
        let weakenAmount = ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target);
        let weakenThreads = weakenAnalyzeThreads(ns, weakenAmount);
        requirements.Weaken.Threads += weakenThreads;
        requirements.Weaken.Ram += getWeakenScriptRam(ns) * weakenThreads
        requirements.Weaken.Duration =  ns.getWeakenTime(target);

        let plan = new ExecutionPlan(ns);
        plan.tasks.push(new GrowTask(ns, target, 0, requirements.Grow));
        plan.tasks.push(new WeakenTask(ns, target, 1, requirements.Weaken));
        plan.compile();
        return plan;
    }

    /**
     * 
     * @param {NS} ns 
     * @param {String} target 
     * @param {Number} hackAmount 
     */
    static getResourceRequirements(ns, target, hackAmount) {
        new Logger(ns, "HWGWExecutionPlanBuilder").trace(`getResourceRequirements() ${ns}, ${target}, ${hackAmount}`);
        const hackThreads = getHackThreads(ns, target, hackAmount);
        const growThreads = getGrowThreads(ns, target, hackAmount);
        const weakenThreads = getWeakenThreads(ns, target, hackAmount);

        let hackTime = ns.getHackTime(target);
        let growTime = ns.getGrowTime(target);
        let weakenTime = ns.getWeakenTime(target);

        // adjust weaken time a little bit to account for the possibility
        // of being executed after a grow has ocurred
        // won't change the batch throughput too much, but a nice safety buffer.
        // if (ns.fileExists("Formulas.exe")) {
        //     let server = ns.getServer(target);
        //     //server.hackDifficulty = server.minDifficulty + getGrowSecurity(ns, growThreads);
        //     server.hackDifficulty += getGrowSecurity(ns, growThreads);
        //     weakenTime = ns.formulas.hacking.weakenTime(server, ns.getPlayer());
        //     growTime = ns.formulas.hacking.growTime(server, ns.getPlayer());
        //     hackTime = ns.formulas.hacking.hackTime(server, ns.getPlayer());
        // }

        return {
            Hack: {
                Threads: hackThreads,
                Ram: getHackScriptRam(ns) * hackThreads,
                Duration: hackTime
            },
            Grow: {
                Threads: growThreads,
                Ram: getGrowScriptRam(ns) * growThreads,
                Duration: growTime
            },
            Weaken: {
                Threads: weakenThreads,
                Ram: getWeakenScriptRam(ns) * weakenThreads,
                Duration: weakenTime
            }
        };
    }
}

export class ExecutionPlan {
    /** @param {NS} ns */
    constructor(ns) {
        this.logger = new Logger(ns, "ExecutionPlan");
        this.logger.trace("constructor()");
        this.ns = ns;
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
