import { getAllPurchasedServers, logInfo, disableNSLogs } from "./utilities.js";

/** @param {NS} ns */
export async function main(ns) {
    disableNSLogs(ns);

    var servers = getAllPurchasedServers(ns);
    var maxRam = ns.getPurchasedServerMaxRam();
    var ram = 8;

    while (ram <= maxRam) {
        logInfo(ns, `autoUpgradeServers.js:main - Current upgrade tier = ${ram}GB`)
        for (const server of servers) {
            if (ram > ns.getServerMaxRam(server)) {
                await upgradeServer(ns, server, ram);
            }
        }
        ram *= 2;
    }
}

/** @param {NS} ns */
export async function upgradeServer(ns, hostname, ram) {
    logInfo(ns, `autoUpgradeServers.js:main - upgrading ${hostname}`);
    var cost = ns.getPurchasedServerCost(ram);
    while (cost >= ns.getServerMoneyAvailable("home") * 0.25) {
        await ns.sleep(60000);
    }

    ns.killall(hostname);
    ns.deleteServer(hostname);
    ns.purchaseServer(hostname, ram);
    ns.scp(["weaken.js", "grow.js", "hack.js"], hostname);
}