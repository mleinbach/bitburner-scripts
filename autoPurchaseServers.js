import { getAllPurchasedServers, logInfo, disableNSLogs } from "utilities"

/** @param {NS} ns */
export async function main(ns) {
    disableNSLogs(ns);
    // How much RAM each purchased server will have. In this case, it'll
    // be 8GB.
    var ram = 8;

    // Iterator we'll use for our loop
    var numServers = getAllPurchasedServers(ns).length;

    // Continuously try to purchase servers until we've reached the maximum
    // amount of servers
    while (numServers < ns.getPurchasedServerLimit()) {
        // Check if we have enough money to purchase a server
        if (ns.getServerMoneyAvailable("home") > ns.getPurchasedServerCost(ram)) {
            // If we have enough money, then:
            //  1. Purchase the server
            //  2. Copy our hacking script onto the newly-purchased server
            //  3. Run our hacking script on the newly-purchased server with 3 threads
            //  4. Increment our iterator to indicate that we've bought a new server
            var hostname = ns.purchaseServer("pserv-" + numServers, ram);
            ns.scp(["weaken.js", "grow.js", "hack.js"], hostname);
            numServers = getAllPurchasedServers(ns).length;
            logInfo(ns, `autopurchaseServer.js:main - purchased server ${hostname}`);
        }
        else {
            logInfo(ns, "autopurchaseServer.js:main - waiting for money");
            await ns.sleep(30000);
        }
    }

    ns.spawn("autoUpgradeServers.js");
}