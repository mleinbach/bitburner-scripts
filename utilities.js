import { logLevels, hgwScripts} from "./constants.js"
import { verbosity } from "./config.js"

export function getOperationScript(operation) {
    if (operation.startsWith("Weaken")) {
        return hgwScripts.Weaken;
    }
    return hgwScripts[operation]
}

export function logFatal(ns, msg) {
    log(ns, msg, logLevels.fatal);
}

export function logError(ns, msg) {
    log(ns, msg, logLevels.error);
}

export function logWarn(ns, msg) {
    log(ns, msg, logLevels.warn);
}

export function logInfo(ns, msg) {
    log(ns, msg, logLevels.info);
}

export function logDebug(ns, msg) {
    log(ns, msg, logLevels.debug);
}

/** @param {NS} ns */
export function log(ns, msg, severity) {
    if (verbosity >= severity[1])  {
        ns.print(`[${(new Date()).toISOString()}] [${severity}] ${msg}`);
    }
}

/** @param {NS} ns */
export function disableNSLogs(ns) {
    // disable the log for disabling the logs
    ns.disableLog("disableLog");
    for (var key in ns) {
        if (typeof ns[key] === "function") {
            ns.disableLog(key);
        }
    }
}

/** @param {NS} ns */
export function getMaxScriptThreads(ns, hostname, script) {
    return Math.floor(ns.getServerMaxRam(hostname) / ns.getScriptRam(script));
}

/** 
 * @param {NS} ns
 * @returns String[]
*/
export function getAllHackableServers(ns) {
    return getAllServers(ns).filter(
        (hostname) => !(hostname.startsWith("pserv") 
        || hostname === "home" 
        || ns.getServerMaxMoney(hostname) <= 0 
        || ns.getServerRequiredHackingLevel(hostname) > ns.getPlayer().skills.hacking));
}

/** 
 * @param {NS} ns
 * @returns String[]
*/
export function getAllPurchasedServers(ns) {
    return getAllServers(ns).filter((hostname) => hostname.startsWith("pserv"));
}

/** 
 * @param {NS} ns 
 * @returns String[]
*/
export function getAllRootedServers(ns) {
    return getAllServers(ns).filter((hostname) => ns.hasRootAccess(hostname));
}

/** 
 *  @param {NS} ns
 *  @returns String[]
 */
export function getAllServers(ns) {
    var q = [];
    var seen = [];

    q.push("home");
    seen.push("home");

    while (q.length > 0) {
        var target = q.shift();
        var hostnames = ns.scan(target);
        for (var hostname of hostnames) {
            var ix = seen.findIndex((x) => x === hostname)
            if (ix == -1) {
                seen.push(hostname);
                q.push(hostname);
            }
        }
    }

    return seen;
}

export function updateScripts(ns) {
    var servers = getAllRootedServers(ns);
    var scripts = ["weaken.js", "grow.js", "hack.js", "utilities.js", "constants.js", "config.js"]

    for (var server of servers) {
        for (var script of scripts) {
            if (ns.isRunning(script, server)) {
                ns.scriptKill(script, server)
            }
            ns.scp(script, server)
        }
    }
}

/** @param {NS} ns */
export function getRoot(ns, hostname) {
    if (!ns.hasRootAccess(hostname) && isRootable(ns, hostname)) {
        logInfo(ns, `utilities.js:getRoot - Getting root access on ${hostname}`)

        for (var [_toolName, toolFunc] of getAvailableTools(ns)) {
            toolFunc(hostname);
        }

        ns.nuke(hostname);
        logInfo(ns, `utilities.js:getRootSuccessfully gained root access.`);

        return true;
    }
    return false;
}

/** 
 *  @param {NS} ns
 *  @returns boolean indicating if gaining root is possible
 */
export function isRootable(ns, hostname) {
    var player = ns.getPlayer();
    var requiredPorts = ns.getServerNumPortsRequired(hostname);
    var requiredHackingLevel = ns.getServerRequiredHackingLevel(hostname);
    var availableTools = getAvailableTools(ns);
    return player.skills.hacking >= requiredHackingLevel && requiredPorts <= availableTools.length;
}

/** @param {NS} ns */
export function getAvailableTools(ns) {
    const hackingTools = [
        ["BruteSSH.exe", ns.brutessh],
        ["FTPCrack.exe", ns.ftpcrack],
        ["relaySMTP.exe", ns.relaysmtp],
        ["HTTPWorm.exe", ns.httpworm],
        ["SQLInject.exe", ns.sqlinject]
    ];
    return hackingTools.filter(([toolName, _toolFunc]) => ns.fileExists(toolName, "home"));
}