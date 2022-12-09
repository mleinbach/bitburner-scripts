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
