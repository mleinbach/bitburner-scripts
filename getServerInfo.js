/** @param {NS} ns */
export async function main(ns) {
    let [target,] = ns.args;
    let server = ns.getServer(target);
    let hacking = ns.getPlayer().skills.hacking;
    let hackingRatio = Math.min(3, hacking / server.requiredHackingSkill);
    let info = {
        "hostname": server.hostname,
        "growth": server.serverGrowth,
        "requiredHackLevel": server.requiredHackingSkill,
        "maxMoney": ns.nFormat(server.moneyMax, "0.000a"),
        "currentMoney": ns.nFormat(server.moneyAvailable, "0.000a"),
        "currentSecurity": ns.nFormat(server.hackDifficulty, "0.000"),
        "minSecurity": ns.nFormat(server.minDifficulty, "0.000"),
        "hackingRatio": ns.nFormat(hackingRatio, "0.000")
    };

    ns.tprint(JSON.stringify(info, null, 2));
}