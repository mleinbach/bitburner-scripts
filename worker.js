import { HGWScripts } from "./constants";

export class Worker {
    /** 
     * @param {NS} ns
     */
    constructor(ns, hostname) {
        this.hostname=hostname;
        this.maxRam = ns.getServerMaxRam(hostname);
        this.maxHackThreads = Math.floor(this.maxRam / ns.getScriptRam(HGWScripts.HACK));
        this.maxGrowThreads = Math.floor(this.maxRam / ns.getScriptRam(HGWScripts.GROW));
        this.maxWeakenThreads = Math.floor(this.maxRam / ns.getScriptRam(HGWScripts.WEAKEN));
    }
}