/** @param {NS} ns */
export async function main(ns) {
    try {
        const [id, target, delay, batchId, port = null] = ns.args
        const startTime = Date.now();
        let portData = {
            target: target,
            id: id,
            batchId: batchId,
            terminated: false,
            startTime: startTime
        }

        const initialHackLevel = ns.getHackingLevel();
        await ns.sleep(delay);
        const currentHackLevel = ns.getHackingLevel();
        if (initialHackLevel < currentHackLevel) {
            portData.terminated = true
            portData.reason = "hacklevel"
            ns.tryWritePort(port, JSON.stringify(portData));
            ns.exit();
        }

        await ns.hack(target);
        const endTime = Date.now();

        portData.endTime = endTime;

        if (port !== null) {
            ns.tryWritePort(port, JSON.stringify(portData));
        }
    } catch (e) {
        ns.print(e.stack);
    }
}