import { updateScripts, disableNSLogs, logInfo, logFatal } from "./utilities"
import { dispatchJobs, getExecutionPlan } from "./hgwUtilities"
import { hgwOperations } from "./constants";

/** @param {NS} ns */
export async function main(ns) {
    disableNSLogs(ns);
    const hgwManagerInfo = JSON.parse(ns.args[0]);
    const target = hgwManagerInfo.Target;
    const jobs = hgwManagerInfo.Jobs;
    const resourceRequirements = hgwManagerInfo.ResourceRequirements;
    const mode = hgwManagerInfo.Mode;

    try {
        //setup
        updateScripts(ns);

        if (mode == "iterative") {
            await runSequential(ns, target, jobs);
        } else {
            await runBatch(ns, target, jobs, resourceRequirements);
        }
    } catch (e) {
        logFatal(ns, `hwgDispatcher.js:main - unhandled exception:\n${e}\nstack trace:\n${e.stack}`)
        throw e
    }
}

/** @param {NS} ns
 *  @param {String} target
 *  @param {any[]} jobs
 */
export async function runSequential(ns, target, jobs) {
    const minSecurityLevel = ns.getServerMinSecurityLevel(target)
    const maxMoney = ns.getServerMaxMoney(target)
    var weakenOperation = hgwOperations.WeakenGrow;
    while (true) {
        const securityLevel = ns.getServerSecurityLevel(target);
        const moneyAvailable = ns.getServerMoneyAvailable(target);

        logInfo(ns, `hwgDispatcher.js:runSequential - SecurityLevel=${ns.getServerSecurityLevel(target)}`)
        logInfo(ns, `hwgDispatcher.js:runSequential - MoneyAvailable=${ns.getServerMoneyAvailable(target)}`)
        if (securityLevel > minSecurityLevel) {
            logInfo(ns, `hwgDispatcher.js:runSequential - Lowering security on ${target}`)
            var waitTime = ns.getWeakenTime(target);
            dispatchJobs(ns, target, jobs, weakenOperation);
            await ns.sleep(waitTime);
        }
        else if (moneyAvailable < maxMoney) {
            weakenOperation = hgwOperations.WeakenGrow;
            logInfo(ns, `hwgDispatcher.js:runSequential - Growing money on ${target}`)
            var waitTime = ns.getGrowTime(target);
            dispatchJobs(ns, target, jobs, hgwOperations.Grow);
            await ns.sleep(waitTime);
        }
        else {
            logInfo(ns, `hwgDispatcher.js:runSequential - Hacking ${target}`)
            weakenOperation = hgwOperations.WeakenHack;
            var waitTime = ns.getHackTime(target);
            dispatchJobs(ns, target, jobs, "Hack");
            await ns.sleep(waitTime);
        }
    }
}

export async function runBatch(ns, target, jobs, resourceRequirements) {
    var executionPlan = getExecutionPlan(ns, target, resourceRequirements.Batches);
    logInfo(ns, `hgwBatchRunner.js:main - ${JSON.stringify(executionPlan, null, 2)}`)

    // needs cleanup
    // wait for any leftover jobs to finish
    logInfo(ns, `hgwBatchRunner.js:main - checking for running hgw scripts`)
    await handleRunningScripts(ns, target, jobs, executionPlan);

    while (true) {
        await runHgwBatch(ns, target, jobs, executionPlan);
    }
}

/** @param {NS} ns
 *  @param {String} target
 *  @param {{
        "Hostname": String,
        "Operation": String,
        "Ram": Number,
        "Threads": Number,
        "Batch": Number
    }[]} batchJobs
 * @param {{
    "Operation": String,
    "Batch": Number,
    "Order": Number,
    "ExecTime": Number,
    "DelayTime": Number
}[]} executionPlan
*/
export async function handleRunningScripts(ns, target, batchJobs, executionPlan) {
    for (var ix in batchJobs) {
        var execIx = executionPlan.findIndex((x) => x.Operation == batchJobs[ix].Operation && x.Batch == batchJobs[ix].Batch)

        var script = null;
        if (batchJobs[ix].Operation == hgwOperations.Hack) {
            script = ns.getRunningScript("hack.js", batchJobs[ix].Hostname, target, executionPlan[execIx].Order);
        } else if (batchJobs[ix].Operation == hgwOperations.Grow) {
            script = ns.getRunningScript("grow.js", batchJobs[ix].Hostname, target, executionPlan[execIx].Order);
        } else {
            script = ns.getRunningScript("weaken.js", batchJobs[ix].Hostname, target, batchJobs[ix].Operation, executionPlan[execIx].Order);
        }

        if (script != null) {
            if (script.filename === "hack.js") {
                ns.kill(script.pid)
            } else {
                await ns.sleep(executionPlan[execIx].ExecTime);
            }
        }
    }
}

/** @param {NS} ns
 *  @param {String} target
 *  @param {{
        "Hostname": String,
        "Operation": String,
        "Ram": Number,
        "Threads": Number,
        "Batch": Number
    }[]} batchJobs
 * @param {{
    "Operation": String,
    "Batch": Number,
    "Order": Number,
    "ExecTime": Number,
    "DelayTime": Number
}[]} executionPlan
* @param {Number} identity
*/
export async function runHgwBatch(ns, target, jobs, executionPlan) {
    var totalDelay = 0;
    ns.grow
    for (var item of executionPlan) {
        var delayTime = item.DelayTime - totalDelay;
        await ns.sleep(delayTime);
        dispatchJobs(ns, target, jobs, item.Operation, item.Batch);
        totalDelay += delayTime;
    }
}