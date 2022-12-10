/** @param {NS} ns */
export async function main(ns) {
    let id = ns.args[0]
    let target = ns.args[1];
    let delay = ns.args[2];
    await ns.sleep(delay);
    await ns.grow(target);
}