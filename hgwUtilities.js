import { securityModifiers, hgwOperations } from "./constants"
import { hgwScripts } from "./constants"
import { Logger } from "./logger";

/** @param {NS} ns */
export function getWeakenScriptRam(ns) {
    return ns.getScriptRam(hgwScripts.Weaken, "home");
}

/** @param {NS} ns */
export function getGrowScriptRam(ns) {
    return ns.getScriptRam(hgwScripts.Grow, "home");
}

/** @param {NS} ns */
export function getHackScriptRam(ns) {
    return ns.getScriptRam(hgwScripts.Hack, "home");
}

/** @param {NS} ns
 *  @param {Number} threads
 *  @returns {Number} security increase caused by running hack() with given number of threads
 */
export function getHackSecurity(ns, threads) {
    new Logger(ns, "hgwUtilities").trace(`getHackSecurity(${ns}, ${threads})`);
    if (threads <= 0) {
        throw new Error(`param threads must be > 0, got ${threads}`);
    }
    return threads * securityModifiers.hack;
}

/** @param {NS} ns
 *  @param {Number} threads
 *  @returns {Number} security increase caused by running grow() with given number of threads
 */
export function getGrowSecurity(ns, threads) {
    new Logger(ns, "hgwUtilities").trace(`getGrowSecurity(${ns}, ${threads})`);
    if (threads <= 0) {
        throw new Error(`param threads must be > 0, got ${threads}`);
    }
    return threads * securityModifiers.grow;
}

/** @param {NS} ns */
export function weakenAnalyzeThreads(ns, securityAmount) {
    new Logger(ns, "hgwUtilities").trace(`weakenAnalyzeThreads(${ns}, ${securityAmount})`);
    const threadsNeeded = Math.ceil(securityAmount / securityModifiers.weaken);
    return threadsNeeded;
}


/** @param {NS} ns */
export function getWeakenThreads(ns, target, hackAmount = 0.10, operation = null) {
    new Logger(ns, "hgwUtilities").trace(`getWeakenThreads(${ns}, ${target}, ${hackAmount}, ${operation})`);
    const hackThreads = getHackThreads(ns, target, hackAmount);
    const growThreads = getGrowThreads(ns, target, hackAmount);

    var targetSecurityIncrease = 0;
    if (operation == hgwOperations.Grow) {
        targetSecurityIncrease = getGrowSecurity(ns, growThreads);
    } else if (operation == hgwOperations.Hack) {
        targetSecurityIncrease = getHackSecurity(ns, hackThreads);
    }
    else {
        targetSecurityIncrease = Math.max(getGrowSecurity(ns, growThreads), getHackSecurity(ns, hackThreads));
    }
    return weakenAnalyzeThreads(ns, targetSecurityIncrease) + 1;
}

/** @param {NS} ns */
export function getGrowThreads(ns, target, hackAmount = 0.10) {
    new Logger(ns, "hgwUtilities").trace(`getGrowThreads(${ns}, ${target}, ${hackAmount})`);
    const serverMaxMoney = ns.getServerMaxMoney(target);
    const hackMoney = serverMaxMoney * hackAmount;
    const availableMoney = Math.max(serverMaxMoney - hackMoney, 1);
    const growAmount = serverMaxMoney - availableMoney;
    const growMultiplier = (growAmount / availableMoney) + 1
    const threadsNeeded = Math.max(1, Math.ceil(ns.growthAnalyze(target, growMultiplier)));

    return threadsNeeded;
}

/** @param {NS} ns */
export function getHackThreads(ns, target, hackAmount = 0.10) {
    new Logger(ns, "hgwUtilities").trace(`getHackThreads(${ns}, ${target}, ${hackAmount})`);
    const money = ns.getServerMaxMoney(target) * hackAmount;
    const threadsNeeded = Math.max(1, Math.floor(ns.hackAnalyzeThreads(target, money)));

    return threadsNeeded;
}

/** @param {NS} ns */
export function analyzeIncomeRate(ns, hostname, hackAmount) {
    let maxMoney = ns.getServerMaxMoney(hostname);
    let hackMoney = maxMoney * hackAmount;
    let availableMoney = maxMoney - hackMoney;
    let requiredHackingLevel = ns.getServerRequiredHackingLevel(hostname);
    let minSecurityLevel = ns.getServerMinSecurityLevel(hostname);
    let growth = ns.getServerGrowth(hostname)

    let mockServer = ns.formulas.mockServer();
    mockServer.requiredHackingSkill = requiredHackingLevel;
    mockServer.moneyAvailable = availableMoney;
    mockServer.hackDifficulty = minSecurityLevel;
    mockServer.serverGrowth = growth;

    const growMultiplier = (hackMoney / availableMoney) + 1
    let player = ns.getPlayer();
    let threads = 1;
    while (ns.formulas.hacking.growPercent(mockServer, threads, player) < growMultiplier) {
        threads++;
    }

    let securityIncrease = getGrowSecurity(ns, threads);
    mockServer.hackDifficulty = minSecurityLevel + securityIncrease;

    let weakenTime = ns.formulas.hacking.weakenTime(mockServer, player);
    let incomeRate = maxMoney / weakenTime;

    return incomeRate;
}
