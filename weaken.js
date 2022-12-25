import { TaskStatus } from "./constants";

/** @param {NS} ns */
export async function main(ns) {
    try {
        const [id, target, delay, duration, batchId, port = null] = ns.args

        let portData = {
            target: target,
            id: id,
            batchId: batchId,
            status: TaskStatus.WAITING,
            startTime: Date.now(),
            executeTime: null,
            endTime: null,
            executeSecurity: null
        }
        if (port !== null){
            ns.tryWritePort(port, JSON.stringify(portData));
        }
        await ns.sleep(delay);

        let actualSleep = Date.now() - portData.startTime;
        let drift = actualSleep - delay;
        if (drift > 50) {
            portData.status = TaskStatus.CANCELLED;
            portData.reason = "overslept";
            ns.exit();
        }

        portData.executeTime = Date.now();
        portData.status = TaskStatus.EXECUTING;
        portData.executeSecurity = ns.getServerSecurityLevel(target);
        if (port !== null){
            ns.tryWritePort(port, JSON.stringify(portData));
        }
        await ns.weaken(target);

        portData.endTime = Date.now();
        portData.status = TaskStatus.COMPLETED;
        if (port !== null) {
            ns.tryWritePort(port, JSON.stringify(portData));
        }
    } catch (e) {
        ns.print(e.stack);
    }
}