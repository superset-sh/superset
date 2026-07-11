import { readFileSync } from "node:fs";

export function isLinuxZombieStat(stat: string): boolean {
	const commandEnd = stat.lastIndexOf(")");
	return commandEnd >= 0 && stat.slice(commandEnd + 2, commandEnd + 3) === "Z";
}

export function isProcessAlive(pid: number): boolean {
	if (!Number.isSafeInteger(pid) || pid <= 1) return false;
	try {
		process.kill(pid, 0);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EPERM") return false;
	}

	if (process.platform === "linux") {
		try {
			if (isLinuxZombieStat(readFileSync(`/proc/${pid}/stat`, "utf8"))) {
				return false;
			}
		} catch {}
	}
	return true;
}
