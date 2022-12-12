/** @param {NS} ns */
export async function main(ns) {
    const [id, target, delay, port=null] = ns.args
    await ns.sleep(delay);
    await ns.grow(target);
}