import { getAllHackableServers } from "./utilities";

/** @param {NS} ns */
export async function main(ns) {
    let profiles = getAllHackableServers(ns).map((s) => {
        let server = ns.getServer(s);
        let hacking = ns.getPlayer().skills.hacking;
        let hackingRatio =  Math.min(3, hacking / server.requiredHackingSkill);
        return {
            "hostname": server.hostname,
            "growth": server.serverGrowth,
            "maxMoney": server.moneyMax,
            "hackLevel": server.requiredHackingSkill,
            "hackingRatio": hackingRatio
        };
    })

    profiles.sort((a, b) => b.growth - a.growth
    ).sort((a, b) => b.maxMoney - a.maxMoney
    ).sort((a, b) => b.hackingRatio - a.hackingRatio);
    
    
    let csv = profiles.map((p) => 
        Object.keys(p).map((k) => p[k]).join("\t")
    ).join("\n");

    
    ns.write("serverProfiles.txt", csv, "w");
}