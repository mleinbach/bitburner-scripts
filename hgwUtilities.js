import { securityModifiers, hgwOperations } from "./constants"
import { scripts } from "./config"
import { Logger } from "./logger";

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
export function getHackSecurity(ns, threads) {
    new Logger(ns, "hgwUtilities").debug(`getHackSecurity(${ns}, ${threads})`);
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
    new Logger(ns, "hgwUtilities").debug(`getGrowSecurity(${ns}, ${threads})`);
    if (threads <= 0) {
        throw new Error(`param threads must be > 0, got ${threads}`);
    }
    return threads * securityModifiers.grow;
}

/** @param {NS} ns */
export function weakenAnalyzeThreads(ns, securityAmount) {
    new Logger(ns, "hgwUtilities").debug(`weakenAnalyzeThreads(${ns}, ${securityAmount})`);
    const threadsNeeded = Math.ceil(securityAmount / securityModifiers.weaken);
    return threadsNeeded;
}


/** @param {NS} ns */
export function getWeakenThreads(ns, target, hackAmount=0.10, operation = null) {
    new Logger(ns, "hgwUtilities").debug(`getWeakenThreads(${ns}, ${target}, ${hackAmount}, ${operation})`);
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
    new Logger(ns, "hgwUtilities").debug(`getGrowThreads(${ns}, ${target}, ${hackAmount})`);
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
    new Logger(ns, "hgwUtilities").debug(`getHackThreads(${ns}, ${target}, ${hackAmount})`);
    const money = ns.getServerMaxMoney(target) * hackAmount;
    const threadsNeeded = Math.max(1, Math.floor(ns.hackAnalyzeThreads(target, money)));

    return threadsNeeded;
}
