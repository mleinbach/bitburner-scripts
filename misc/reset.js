/** @param {NS} ns */
export async function main(ns) {
    for (var hostname of ns.getPurchasedServers()) {
        ns.deleteServer(hostname);
    }

    while(ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(2)){
        ns.deleteServer(ns.purchaseServer("temp", 2));
    }
}