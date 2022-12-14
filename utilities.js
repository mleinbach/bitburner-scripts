import { HGWScripts} from "./constants.js"
import { Logger } from "./logger.js";

export function getOperationScript(operation) {
    if (operation.startsWith("Weaken")) {
        return HGWScripts.WEAKEN;
    }
    return HGWScripts[operation]
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
    var scripts = ["constants.js", "scratch.js", "weaken.js", "grow.js", "hack.js", "mock.js"]

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
    let logger = new Logger(ns, "Utilities");
    if (ns.hasRootAccess(hostname)) {
        return true;
    }
    if (!isRootable(ns, hostname)) {
        return false;
    }

    logger.info(ns, `Getting root access on ${hostname}`)

    for (var [_toolName, toolFunc] of getAvailableTools(ns)) {
        toolFunc(hostname);
    }

    ns.nuke(hostname);

    return true;
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
