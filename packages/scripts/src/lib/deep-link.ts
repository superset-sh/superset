import { spawn } from "node:child_process";

const PROTOCOL = process.env.SUPERSET_PROTOCOL ?? "superset";

export function openDeepLink(path: string): void {
	const url = `${PROTOCOL}://${path}`;
	spawn("open", [url], { stdio: "ignore", detached: true }).unref();
}
