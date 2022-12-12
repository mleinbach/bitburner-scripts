/** @param {NS} ns */
export async function main(ns) {
    const [id, target, duration, order, delay, batchId, port=null] = ns.args
    startTime = Date.now();
    await ns.sleep(delay);
    await ns.sleep(duration);
    endTime = Date.now();

    if (port !== null) {
        ns.tryWritePort(port, JSON.stringify({id: id, batchId: batchId, order: order, startTime: startTime, endTime: endTime}))
    }
}