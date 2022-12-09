import { logInfo, getOperationScript } from "./utilities"
import { securityModifiers, hgwOperations, hgwScripts } from "./constants"
import { timing, scripts } from "./config"
import { Task } from "./task";

/** @param {NS} ns */
export function getWeakenScriptRam(ns) {
    return ns.getScriptRam(scripts.WeakenScript, "home");
}

/** @param {NS} ns */
export function getGrowScriptRam(ns) {
    return ns.getScriptRam(scripts.GrowScript, "home");
}

/** @param {NS} ns */
export function getHackScriptRam(ns) {
    return ns.getScriptRam(scripts.HackScript, "home");
}

/** @param {NS} ns
 *  @param {Number} threads
 *  @returns {Number} security increase caused by running hack() with given number of threads
 */
export function getHackSecurity(threads) {
    if (threads <= 0) {
        throw `utilities.js:getHackSecurity - param threads must be > 0, got ${threads}`;
    }
    return threads * securityModifiers.hack;
}

/** @param {NS} ns
 *  @param {Number} threads
 *  @returns {Number} security increase caused by running grow() with given number of threads
 */
export function getGrowSecurity(threads) {
    if (threads <= 0) {
        throw `utilities.js:getGrowSecurity - param threads must be > 0, got ${threads}`;
    }
    return threads * securityModifiers.grow;
}

/** @param {NS} ns
 *  @param {Number} threads
 *  @returns {Number} security increase caused by running weaken() with given number of threads
 */
export function getWeakenSecurity(threads) {
    if (threads <= 0) {
        throw `utilities.js:getWeakenSecurity - param threads must be > 0, got ${threads}`;
    }
    return threads * securityModifiers.weaken;
}

/** @param {NS} ns */
export function weakenAnalyzeThreads(securityAmount) {
    const threadsNeeded = Math.ceil(securityAmount / securityModifiers.weaken);
    return threadsNeeded;
}


/** @param {NS} ns */
export function getWeakenThreads(ns, target, hackAmount=0.10, operation = null) {
    const hackThreads = getHackThreads(ns, target, hackAmount);
    const growThreads = getGrowThreads(ns, target, hackAmount);

    var targetSecurityIncrease = 0;
    if (operation == hgwOperations.Grow) {
        targetSecurityIncrease = getGrowSecurity(growThreads);
    } else if (operation == hgwOperations.Hack) {
        targetSecurityIncrease = getHackSecurity(hackThreads);
    }
    else {
        targetSecurityIncrease = Math.max(getGrowSecurity(growThreads), getHackSecurity(hackThreads));
    }
    return weakenAnalyzeThreads(targetSecurityIncrease) + 1;
}

/** @param {NS} ns */
export function getGrowThreads(ns, target, hackAmount = 0.10) {
    const serverMaxMoney = ns.getServerMaxMoney(target);
    const hackMoney = serverMaxMoney * hackAmount;
    const availableMoney = Math.max(serverMaxMoney - hackMoney, 1);
    const growAmount = serverMaxMoney - availableMoney;
    const growMultiplier = (growAmount / availableMoney) + 1
    const threadsNeeded = Math.ceil(ns.growthAnalyze(target, growMultiplier));

    return threadsNeeded;
}

/** @param {NS} ns */
export function getHackThreads(ns, target, hackAmount = 0.10) {
    const money = ns.getServerMaxMoney(target) * hackAmount;
    const threadsNeeded = Math.floor(ns.hackAnalyzeThreads(target, money));

    return threadsNeeded;
}

/** @param {NS} ns
 *  @param {String} target
 *  @param {{Hostname: String,Operation: String,Ram: Number,Threads: Number,Batch: Number}[]} jobs
 * @param {Number} batchNumber
 * @param {Number} identity
 */
export function dispatchJobs(ns, target, jobs, operation, batchNumber = -1, identity = -1) {
    var script = getOperationScript(operation);
    var filteredJobs = jobs.filter((x) => x.Threads > 0 && x.Operation === operation);
    if (batchNumber >= 0) {
        filteredJobs = filteredJobs.filter((x) => x.Batch == batchNumber);
    }
    var tasks = []
    for (const job of filteredJobs) {
        var task = new Task(ns, target, job.Hostname, script);
        tasks.push(task);
        task.execute(job.Threads);
    }
    return tasks;
}

/** @param {NS} ns
 *  @param {String} target
 *  @param {Number} batches
 */
 export function getExecutionPlan(ns, target, batches) {
    var timings = [
        {
            "Operation": hgwOperations.Hack,
            "Batch": 0,
            "Order": 0,
            "ExecTime": ns.getHackTime(target) + timing.hgwDelay
        },
        {
            "Operation": hgwOperations.WeakenHack,
            "Batch": 0,
            "Order": 1,
            "ExecTime": ns.getWeakenTime(target) + timing.hgwDelay
        },
        {
            "Operation": hgwOperations.Grow,
            "Batch": 0,
            "Order": 2,
            "ExecTime": ns.getGrowTime(target) + timing.hgwDelay
        },
        {
            "Operation": hgwOperations.WeakenGrow,
            "Batch": 0,
            "Order": 3,
            "ExecTime": ns.getWeakenTime(target) + timing.hgwDelay
        }
    ]

    var timingsCopy = JSON.parse(JSON.stringify(timings));
    for (var i = 1; i < batches; ++i) {
        var newTimings = JSON.parse(JSON.stringify(timingsCopy));
        newTimings.forEach((x, ix) => {
            x.Order = timings.length + ix;
            x.Batch = i;
        });
        timings.push(...newTimings);
    }

    // get inital plan
    var delayTime = timing.batchExecOrderDelay;
    var batchDelayTime = timing.batchBufferDelay;
    var longest = timings.reduce((x, y) => x.ExecTime >= y.ExecTime ? x : y);
    var executionPlan = timings.map((x) => {
        return {
            "Operation": x.Operation,
            "Batch": x.Batch,
            "Order": x.Order,
            "ExecTime": x.ExecTime,
            "DelayTime": ((longest.ExecTime - x.ExecTime) + (x.Order * delayTime) + x.Batch * batchDelayTime) - longest.Order * delayTime //optional add between batch delay
        }
    }).map((x) => {
        return {
            "Operation": x.Operation,
            "Batch": x.Batch,
            "Order": x.Order,
            "ExecTime": x.ExecTime,
            "DelayTime": x.DelayTime,
            "TotalTime": x.ExecTime + x.DelayTime
        }
    });
    executionPlan.sort((x, y) => {
        if (x.DelayTime > y.DelayTime) {
            return 1;
        } else if (x.DelayTime < y.DelayTime) {
            return -1;
        } else {
            return x.Order - y.Order;
        }
    });

    return executionPlan;
}