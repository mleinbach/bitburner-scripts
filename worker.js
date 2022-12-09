import { hgwScripts } from "./constants";

export class Worker {
    /** 
     * @param {NS} ns
     */
    constructor(ns, hostname) {
        this.hostname=hostname;
        this.maxRam = ns.getServerMaxRam(hostname);
        this.maxHackThreads = Math.floor(this.maxRam / ns.getScriptRam(hgwScripts.Hack));
        this.maxGrowThreads = Math.floor(this.maxRam / ns.getScriptRam(hgwScripts.Grow));
        this.maxWeakenThreads = Math.floor(this.maxRam / ns.getScriptRam(hgwScripts.Weaken));
    }
}