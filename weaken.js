/** @param {NS} ns */
export async function main(ns) {
    try {
        const [id, target, delay, batchId, port = null] = ns.args
        const startTime = Date.now();
        await ns.sleep(delay);
        await ns.weaken(target);
        const endTime = Date.now();

        if (port !== null) {
            ns.tryWritePort(port, JSON.stringify({ target:target, id: id, batchId: batchId, startTime: startTime, endTime: endTime }));
        }
    } catch (e) {
        ns.print(e.stack);
    }
}