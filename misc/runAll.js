/** @param {NS} ns */
export async function main(ns) {
    ns.exec("hgwDispatcher.js", "home");
    ns.exec("autoPurchaseServers.js", "home")
}