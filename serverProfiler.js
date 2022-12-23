import { getAllHackableServers } from "./utilities";

/** @param {NS} ns */
export async function main(ns) {
    let profiles = getAllHackableServers(ns).map((s) => {
        let server = ns.getServer(s);
        let hacking = ns.getPlayer().skills.hacking;
        let hackingRatio = Math.min(3, hacking / server.requiredHackingSkill);
        return {
            "hostname": server.hostname,
            "growth": server.serverGrowth,
            "hackLevel": server.requiredHackingSkill,
            "maxMoney": server.moneyMax,
            "currentMoney": server.moneyAvailable,
            "currentSecurity": server.hackDifficulty,
            "minSecurity": server.minDifficulty,
            "hackingRatio": hackingRatio
        };
    })

    profiles.sort((a, b) => b.growth - a.growth
    ).sort((a, b) => b.maxMoney - a.maxMoney
    ).sort((a, b) => b.hackingRatio - a.hackingRatio);

    profiles = profiles.map((p) => {
        return {
            "hostname": p.hostname,
            "growth": p.growth,
            "hackLevel": p.hackLevel,
            "maxMoney": ns.nFormat(p.maxMoney, "0.000a"),
            "currentMoney": ns.nFormat(p.currentMoney, "0.000a"),
            "currentSecurity": ns.nFormat(p.currentSecurity, "0.000"),
            "minSecurity": ns.nFormat(p.minSecurity, "0.000"),
            "hackingRatio": ns.nFormat(p.hackingRatio, "0.000")
        }
    })

    profiles.unshift({
        "hostname": "hostname",
        "growth": "growth",
        "hackLevel": "hackLevel",
        "maxMoney": "maxMoney",
        "currentMoney": "currentMoney",
        "currentSecurity": "currentSecurity",
        "minSecurity": "minSecurity",
        "hackingRatio": "hackingRatio"
    });


    let csv = profiles.map((p) =>
        Object.keys(p).map((k) => p[k]).join("\t")
    ).join("\n");


    ns.write("serverProfiles.txt", csv, "w");
}