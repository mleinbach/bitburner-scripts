import { getAllHackableServers, getAllRootedServers, getRoot } from "./utilities"
import { disableNSLogs, logDebug, logInfo, logFatal, logError } from "./utilities"
import { getWeakenThreads, getGrowThreads, getHackThreads, weakenAnalyzeThreads } from "./hgwUtilities"
import { getWeakenScriptRam, getHackScriptRam, getGrowScriptRam, getExecutionPlan } from "./hgwUtilities"
import { dispatchJobs } from "./hgwUtilities"
import { hgwOperations } from "./constants"
import { hackAmount, timing, nsPorts } from "./config"

/** @param {NS} ns */
export async function main(ns) {
    disableNSLogs(ns);

    var targets = Object.create(null);
    var targetAll = false;
    var argsCopy = JSON.parse(JSON.stringify(ns.args));
    while (argsCopy.length > 0) {
        var arg = argsCopy.shift();
        if (arg === "-s") {
            if (argsCopy.length >= 0 && !argsCopy[0].startsWith("-")) {
                targets[argsCopy.shift()] = true;
            } else {
                throw "ArgumentError: -t flag provided with no value"
            }
        } else if (arg === "--target-all") {
            targetAll = true;
        }
    }

    try {
        await start(ns, targets, targetAll);
    } catch (e) {
        logFatal(ns, `hgwManager.js:main - unhandled exception:\n${e}\nstack trace:\n${e.stack}`)
        //ns.scriptKill("hgwDispatcher.js", "home");
        throw e
    }
}

/** 
 * @param {NS} ns
 * @param {Object} targets
 * @param {bool} targetAll
 * */
export async function start(ns, targets, targetAll) {
    var targetsPH = ns.getPortHandle(nsPorts.hgwManagerTargets);
    var hgwDispatchers = getRunningHgwDispatchers(ns);
    var resourceInformation = updateResourceInformation(ns, hgwDispatchers);

    while (true) {
        // rootable server scan loop
        const hackableServers = getAllHackableServers(ns)
        for (const hostname of hackableServers) {
            getRoot(ns, hostname);
        }

        // var reallocateDispatchers = hgwDispatchers.filter((x) => {
        //     const jobThreads = sumJobThreads(x.Jobs);
        //     return (
        //         x.ResourceRequirements.Hack.Threads > jobThreads.HackThreads
        //         || x.ResourceRequirements.Grow.Threads > jobThreads.GrowThreads
        //         || x.ResourceRequirements.WeakenHack.Threads > jobThreads.WeakenHackThreads
        //         || x.ResourceRequirements.WeakenGrow.Threads > jobThreads.WeakenGrowThreads

        //     );
        // })
        // if (reallocateDispatchers.length > 0) {
        //     var dispatcher = reallocateDispatchers.shift();
        //     ns.kill(dispatcher.PID);
        // }

        // reap dead hgwDispatchers to free reserved threads
        hgwDispatchers = hgwDispatchers.filter((x) => ns.getRunningScript(x.PID, "home") != null);
        resourceInformation = updateResourceInformation(ns, hgwDispatchers);

        // read port for new targets
        var untargetedServers = [];
        if (targetAll) {
            untargetedServers = hackableServers.filter((s) => ns.hasRootAccess(s) && hgwDispatchers.findIndex((d) => d.Target === s) == -1);
            prioritizeTargets(ns, untargetedServers);
        } else {
            // read port for new targets
            getNewTargetsFromPort(targetsPH, targets);
            untargetedServers = Object.keys(targets).filter((t) => hgwDispatchers.findIndex((d) => d.Target === t) == -1);
        }
        prioritizeTargets(ns, untargetedServers);

        if (untargetedServers.length > 0) {
            // check for servers that are unhacked
            var server = untargetedServers.shift();
            logInfo(ns, `hgwManager.js:main - initializing target server ${server}`);
            await initializeServer(ns, server, resourceInformation);

            // reserve worker threads
            const resourceRequirements = getResourceRequirements(ns, server, hackAmount);
            logInfo(ns, `hgwManager.js:main - hgwDispatcher resource requirements for ${server}: ${JSON.stringify(resourceRequirements, null, 2)}`);

            // try to run batch jobs first
            var jobs = [];
            var dispatcherMode = "iterative";
            for (var i = 0; i < resourceRequirements.Batches; ++i) {
                const newBatch = assignWorkersToBatchJobs(ns, resourceRequirements, resourceInformation.FreeWorkers, i);
                if (newBatch.length == 4) {
                    jobs.push(...newBatch);
                    dispatcherMode = "batch";
                }
            }

            // if no job was created, then attempt to create iterative jobs
            if (jobs.length == 0) {
                jobs = assignWorkersToJobs(ns, resourceRequirements, resourceInformation.FreeWorkers);
            }


            if (jobs.length > 0) {
                // start new hgwDispatcher process
                var newDispatcher = startHgwDispatcher(ns, server, resourceRequirements, jobs, dispatcherMode);
                logInfo(ns, `hgwManager.js:main - registered new hgwDispatcher PID=${newDispatcher.PID}`);
                hgwDispatchers.push(newDispatcher);
                var resourceInformation = updateResourceInformation(ns, hgwDispatchers);
            } else {
                logInfo(ns, `hgwManager.js:main - waiting for resources`);
            }
        }
        else {
            logInfo(ns, `hgwManager.js:main - no new targets`);
        }

        await ns.sleep(60000);
    }
}

export function updateResourceInformation(ns, hgwDispatchers) {
    const workerAvailableResources = getAvailableWorkerResources(ns);
    const workerReservedResources = getReservedWorkerResources(hgwDispatchers);
    const workerFreeResources = getFreeWorkerResources(workerAvailableResources, workerReservedResources);

    const totalAvailableResources = sumWorkerResources(workerAvailableResources);
    const totalReservedResources = sumWorkerResources(workerReservedResources);
    const totalFreeResources = sumWorkerResources(workerFreeResources);

    logInfo(ns, `hgwManager.js:main - availableResources: ${JSON.stringify(totalAvailableResources, null, 2)}`);
    logInfo(ns, `hgwManager.js:main - reservedResources: ${JSON.stringify(totalReservedResources, null, 2)}`);
    logInfo(ns, `hgwManager.js:main - freeResources: ${JSON.stringify(totalFreeResources, null, 2)}`);

    return {
        "TotalAvailable": totalAvailableResources,
        "TotalReserved": totalReservedResources,
        "TotalFree": totalFreeResources,
        "AvailableWorkers": workerAvailableResources,
        "ReservedWorkers": workerReservedResources,
        "FreeWorkers": workerFreeResources
    }
}

/** @param {NS} ns */
export function getAvailableWorkerResources(ns) {
    return getAllRootedServers(ns).filter((s) => s != "home").map((s) => {
        return {
            "Hostname": s,
            "HackThreads": Math.floor(ns.getServerMaxRam(s) / getHackScriptRam(ns)),
            "GrowThreads": Math.floor(ns.getServerMaxRam(s) / getGrowScriptRam(ns)),
            "WeakenThreads": Math.floor(ns.getServerMaxRam(s) / getWeakenScriptRam(ns)),
            "Ram": ns.getServerMaxRam(s)
        };
    });
}

export function getReservedWorkerResources(hgwDispatchers) {
    var workers = []
    for (var dispatcher of hgwDispatchers) {
        for (var job of dispatcher.Jobs) {
            var ix = workers.findIndex((x) => x.Hostname === job.Hostname);
            if (ix == -1) {
                var jobCopy = JSON.parse(JSON.stringify(job));

                var length = workers.push({
                    "Hostname": jobCopy.Hostname,
                    "HackThreads": 0,
                    "GrowThreads": 0,
                    "WeakenThreads": 0,
                    "Ram": 0
                });
                ix = length - 1;
            }

            if (job.Operation === hgwOperations.Grow) {
                workers[ix].GrowThreads += job.Threads;
            } else if (job.Operation === hgwOperations.Hack) {
                workers[ix].HackThreads += job.Threads;
            } else {
                workers[ix].WeakenThreads += job.Threads;
            }

            workers[ix].Ram += job.Ram;
        }
    }

    return workers;
}

export function getFreeWorkerResources(workerAvailableResources, workerReservedResources) {
    var workerFreeResources = []
    for (var availableResources of workerAvailableResources) {
        var ix = workerReservedResources.findIndex((x) => x.Hostname === availableResources.Hostname);
        if (ix == -1) {
            workerFreeResources.push(availableResources);
        } else {
            workerFreeResources.push({
                "Hostname": availableResources.Hostname,
                "HackThreads": availableResources.HackThreads - workerReservedResources[ix].HackThreads,
                "GrowThreads": availableResources.GrowThreads - workerReservedResources[ix].GrowThreads,
                "WeakenThreads": availableResources.WeakenThreads - workerReservedResources[ix].WeakenThreads,
                "Ram": availableResources.Ram - workerReservedResources[ix].Ram
            });
        }
    }
    return workerFreeResources;
}

export function sumWorkerResources(workerResources) {
    return workerResources.map((s) => {
        return {
            "HackThreads": s.HackThreads,
            "GrowThreads": s.GrowThreads,
            "WeakenThreads": s.WeakenThreads,
            "Ram": s.Ram
        };
    }).reduce((x, y) => {
        var result = {}
        for (var k in x) {
            result[k] = x[k] + y[k]
        }
        return result;
    }, {
        "HackThreads": 0,
        "GrowThreads": 0,
        "WeakenThreads": 0,
        "Ram": 0
    });
}

export function sumJobThreads(jobs) {
    const hackThreads = jobs.filter((j) => j.Operation === "Hack").reduce((prev, curr) => prev.Threads + curr.Threads);
    const growThreads = jobs.filter((j) => j.Operation === "Grow").reduce((prev, curr) => prev.Threads + curr.Threads);
    const weakenHackThreads = jobs.filter((j) => j.Operation === "WeakenHack").reduce((prev, curr) => prev.Threads + curr.Threads);
    const weakenGrowThreads = jobs.filter((j) => j.Operation === "WeakenGrow").reduce((prev, curr) => prev.Threads + curr.Threads);

    return {
        "HackThreads": hackThreads,
        "GrowThreads": growThreads,
        "WeakenHackThreads": weakenHackThreads,
        "WeakenGrowThreads": weakenGrowThreads
    }
}

/** @param {NS} ns */
export async function initializeServer(ns, target, resourceInformation) {
    const minSecurityLevel = ns.getServerMinSecurityLevel(target)
    const maxMoney = ns.getServerMaxMoney(target)
    while (true) {
        var securityLevel = ns.getServerSecurityLevel(target);
        var moneyAvailable = ns.getServerMoneyAvailable(target);
        logInfo(ns, `hgwManager:initializeServer - SecurityLevel=${securityLevel}/${minSecurityLevel}`)
        logInfo(ns, `hgwManager:initializeServer - MoneyAvailable=${moneyAvailable}/${maxMoney}`)
        if (securityLevel > minSecurityLevel) {
            logInfo(ns, `hgwManager:initializeServer - Lowering security on ${target}`)
            await minimizeSecurityLevel(ns, target, resourceInformation);
        }
        else if (moneyAvailable < maxMoney) {
            logInfo(ns, `hgwManager:initializeServer - Growing money on ${target}`)
            await maximizeMoney(ns, target, resourceInformation);
        }
        else {
            break;
        }
    }
}

/** @param {NS} ns */
export async function minimizeSecurityLevel(ns, target, resourceInformation) {
    var weakenAmount = ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target);
    weakenAmount = Math.ceil((weakenAmount + Number.EPSILON) * 100) / 100;
    const threadsNeeded = weakenAnalyzeThreads(weakenAmount);
    const ramNeeded = getWeakenScriptRam(ns) * threadsNeeded;
    const resourceRequirements = {
        "Hack": { "Threads": 0, "Ram": 0 },
        "Grow": { "Threads": 0, "Ram": 0 },
        "WeakenGrow": { "Threads": threadsNeeded, "Ram": ramNeeded },
        "WeakenHack": { "Threads": 0, "Ram": 0 }
    }
    const jobs = assignWorkersToJobs(ns, resourceRequirements, resourceInformation.FreeWorkers, -1);
    logInfo(ns, `hgwManager.js:maximizeMoney - weakenAmount=${weakenAmount}`);
    logInfo(ns, `hgwManager.js:maximizeMoney - threads=${threadsNeeded}`);
    const waitTime = ns.getWeakenTime(target) + 500;
    dispatchJobs(ns, target, jobs, hgwOperations.WeakenGrow);
    await ns.sleep(waitTime);
}

/** @param {NS} ns */
export async function maximizeMoney(ns, target, resourceInformation) {
    var growAmount = (ns.getServerMaxMoney(target) - ns.getServerMoneyAvailable(target)) / ns.getServerMaxMoney(target);
    growAmount = Math.ceil((growAmount + Number.EPSILON) * 100) / 100;
    const threadsNeeded = getGrowThreads(ns, target, growAmount)
    const ramNeeded = getGrowScriptRam(ns) * threadsNeeded;
    const resourceRequirements = {
        "Hack": { "Threads": 0, "Ram": 0 },
        "Grow": { "Threads": threadsNeeded, "Ram": ramNeeded },
        "WeakenGrow": { "Threads": 0, "Ram": 0 },
        "WeakenHack": { "Threads": 0, "Ram": 0 },
    }
    const jobs = assignWorkersToJobs(ns, resourceRequirements, resourceInformation.FreeWorkers, -1);
    logInfo(ns, `hgwManager.js:maximizeMoney - growAmount=${growAmount}`);
    logInfo(ns, `hgwManager.js:maximizeMoney - threads=${threadsNeeded}`);
    const waitTime = ns.getGrowTime(target) + 500;
    dispatchJobs(ns, target, jobs, hgwOperations.Grow);
    await ns.sleep(waitTime);
}

export function prioritizeTargets(ns, rootedHackableServers) {
    rootedHackableServers.sort((x, y) => {
        var hackLevelThreshold = ns.getPlayer().skills.hacking / 3;
        if (ns.getServerRequiredHackingLevel(x) < hackLevelThreshold) {
            return -1;
        } else if ((ns.getServerRequiredHackingLevel(y) < hackLevelThreshold)) {
            return 1;
        }
        else {
            if (ns.getServerGrowth(x) > ns.getServerGrowth(y)) {
                return 1;
            } else if (ns.getServerGrowth(x) < ns.getServerGrowth(y)) {
                return -1;
            } else {
                if (ns.getServerMaxMoney(x) > ns.getServerMaxMoney(y)) {
                    return 1;
                } else if (ns.getServerMaxMoney(x) < ns.getServerMaxMoney(y)) {
                    return -1;
                } else {
                    return 0;
                }
            }
        }
    });
}

/** @param {NS} ns */
export function assignWorkersToBatchJobs(ns, resourceRequirements, freeWorkerResources, batch) {
    var jobs = []

    for (var key in resourceRequirements) {
        if (key === "Batches") {
            continue;
        }
        if (resourceRequirements[key].Threads < 0) {
            continue;
        }

        var workerKey = key + "Threads";
        if (key.startsWith("Weaken")) {
            workerKey = "WeakenThreads";
        }

        for (var worker of freeWorkerResources) {
            if (worker[workerKey] > resourceRequirements[key].Threads) {
                worker.HackThreads -= Math.ceil(resourceRequirements[key].Ram / getHackScriptRam(ns));
                worker.GrowThreads -= Math.ceil(resourceRequirements[key].Ram / getGrowScriptRam(ns));
                worker.WeakenThreads -= Math.ceil(resourceRequirements[key].Ram / getWeakenScriptRam(ns));
                worker.Ram -= resourceRequirements[key].Ram;

                jobs.push(
                    {
                        "Hostname": worker.Hostname,
                        "Operation": key,
                        "Ram": resourceRequirements[key].Ram,
                        "Threads": resourceRequirements[key].Threads,
                        "Batch": batch
                    });
                break;
            }
        }
    }

    return jobs;
}

/** 
 * @param {NS} ns
 * @param {any[]} resourceRequirements
 * @param {any[]} freeWorkerResources 
 */
export function assignWorkersToJobs(ns, resourceRequirements, freeWorkerResources) {
    var jobs = []
    var remainingResources = JSON.parse(JSON.stringify(resourceRequirements));
    freeWorkerResources.sort((x, y) => y.Ram - x.Ram);
    for (var worker of freeWorkerResources) {
        var threadsRequest = {
            "Hack": Math.min(remainingResources.Hack.Threads, worker.HackThreads),
            "Grow": Math.min(remainingResources.Grow.Threads, worker.GrowThreads),
            "WeakenGrow": Math.min(remainingResources.WeakenGrow.Threads, worker.WeakenThreads),
            "WeakenHack": Math.min(remainingResources.WeakenHack.Threads, worker.WeakenThreads)
        }

        var memoryRequest = Math.max(
            threadsRequest.Hack * getHackScriptRam(ns),
            threadsRequest.Grow * getGrowScriptRam(ns),
            threadsRequest.WeakenHack * getWeakenScriptRam(ns),
            threadsRequest.WeakenGrow * getWeakenScriptRam(ns));

        for (var key in threadsRequest) {
            if (threadsRequest[key] > 0) {
                jobs.push(
                    {
                        "Hostname": worker.Hostname,
                        "Operation": key,
                        "Threads": threadsRequest[key],
                        "Ram": memoryRequest / Object.keys(threadsRequest).length
                    }
                );

                remainingResources[key].Threads -= threadsRequest[key];
            }
        }

        worker.HackThreads -= Math.ceil(memoryRequest / getHackScriptRam(ns));
        worker.GrowThreads -= Math.ceil(memoryRequest / getGrowScriptRam(ns));
        worker.WeakenThreads -= Math.ceil(memoryRequest / getWeakenScriptRam(ns));
        worker.Ram -= memoryRequest;

        if (Object.entries(remainingResources).every((x) => x[0] === "Batches" || x[1].Threads <= 0)) {
            break;
        }
    }
    return jobs;
}

/** @param {NS} ns */
export function getResourceRequirements(ns, server, hackAmount) {
    const hackThreads = getHackThreads(ns, server, hackAmount);
    const growThreads = getGrowThreads(ns, server, hackAmount);
    const weakenGrowThreads = getWeakenThreads(ns, server, hackAmount, hgwOperations.Grow);
    const weakenHackThreads = getWeakenThreads(ns, server, hackAmount, hgwOperations.Hack);

    const executionPlan = getExecutionPlan(ns, server, 1);
    const totalBatchTime = executionPlan.map((x) => x.TotalTime).reduce((x, y) => x > y ? x : y);
    const batches = Math.floor(totalBatchTime / (executionPlan.length * timing.batchExecOrderDelay));

    var resourceRequirements = {
        "Hack": {
            "Threads": hackThreads,
            "Ram": getHackScriptRam(ns) * hackThreads
        },
        "Grow": {
            "Threads": growThreads,
            "Ram": getGrowScriptRam(ns) * growThreads
        },
        "WeakenGrow": {
            "Threads": weakenGrowThreads,
            "Ram": getGrowScriptRam(ns) * weakenGrowThreads
        },
        "WeakenHack": {
            "Threads": weakenHackThreads,
            "Ram": getHackScriptRam(ns) * weakenHackThreads
        },
        "Batches": batches
    };

    return resourceRequirements;
}

/** @param {NS} ns */
export function getRunningHgwDispatchers(ns) {
    var processes = ns.ps("home");
    var hgwDispatchers = processes.filter(
        (p) => p.filename === "hgwDispatcher.js"
    ).map((p) => {
        var dispatcher = JSON.parse(p.args[0]);
        dispatcher.PID = p.pid;
        return dispatcher;
    });
    logInfo(ns, `hgwManager.js:main - discovered ${hgwDispatchers.length} running hgwDispatcher`);
    return hgwDispatchers;
}

/** @param {NS} ns */
export function startHgwDispatcher(ns, target, resourceRequirements, jobs, mode) {
    logInfo(ns, `hgwManager.js:main - starting new hgwDispatcher for ${target}`);
    var dispatcher = {
        "Target": target,
        "PID": null,
        "ResourceRequirements": resourceRequirements,
        "Jobs": jobs,
        "Mode": mode
    }

    var pid = ns.exec("hgwDispatcher.js", "home", 1, `${JSON.stringify(dispatcher)}`);
    if (pid != 0) {
        dispatcher.PID = pid;
    }
    else {
        logError(ns, `Error occurred launching hgwDispatcher: ${dispatcher}`);
    }
    return dispatcher;
}

/** @param {NetscriptPort} portHandle */
export function getNewTargetsFromPort(portHandle, targets) {
    var portData = portHandle.read();
    if (portData != "NULL PORT DATA") {
        portData = JSON.parse(portData);
        for (var newTarget in portData) {
            if (!(newTarget in targets)) {
                targets[newTarget] = True;
            }
        }
    }
}