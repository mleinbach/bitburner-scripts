import { getAllServers, getRoot } from "./utilities";

/** @param {NS} ns */
export async function main(ns) {
    getAllServers(ns).forEach((s) => getRoot(ns, s))
}