import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { open, readdir, readlink } from "node:fs/promises";
import { promisify } from "node:util";
import {
	collectProcessTree,
	readProcessTableAsync,
} from "@superset/pty-daemon/process-tree";

const execFileAsync = promisify(execFile);
const rolloutPattern =
	/^(.*)\/sessions\/\d{4}\/\d{2}\/\d{2}\/rollout-[^/]*-([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})\.jsonl$/i;

export interface CodexForkSource {
	sessionId: string;
	home: string;
}

export function verifiedCodexForkHome(input: {
	requestedSessionId: string;
	boundSessionId?: string;
	sessionHome?: string;
	discovered: CodexForkSource | null;
}): string | null {
	const sessionId = input.discovered?.sessionId ?? input.boundSessionId;
	return sessionId === input.requestedSessionId
		? (input.sessionHome ?? null)
		: null;
}

export async function resolveCodexRolloutFiles(
	paths: string[],
): Promise<CodexForkSource | null> {
	const sources = new Map<string, CodexForkSource>();
	for (const path of new Set(paths)) {
		const match = rolloutPattern.exec(path);
		if (!match) continue;
		const file = await open(
			path,
			constants.O_RDONLY | constants.O_NONBLOCK,
		).catch(() => null);
		if (!file) continue;
		try {
			if (!(await file.stat()).isFile()) continue;
			const buffer = Buffer.alloc(1024 * 1024);
			const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
			const line = buffer
				.subarray(0, bytesRead)
				.toString("utf8")
				.split("\n")[0];
			if (!line) continue;
			const record = JSON.parse(line);
			if (
				record.type !== "session_meta" ||
				record.payload?.source !== "cli" ||
				record.payload.id !== match[2]
			)
				continue;
			const source = {
				sessionId: record.payload.id as string,
				home: match[1] as string,
			};
			sources.set(`${source.home}\0${source.sessionId}`, source);
		} catch {
		} finally {
			await file.close();
		}
	}
	return sources.size === 1 ? ([...sources.values()][0] ?? null) : null;
}

export async function discoverCodexForkSource(
	shellPid: number,
): Promise<CodexForkSource | null> {
	try {
		const table = await readProcessTableAsync();
		if (!table) return null;
		const pids = [...collectProcessTree(shellPid, table)];
		if (pids.length > 64) return null;
		let paths: string[];
		if (process.platform === "linux") {
			paths = (
				await Promise.all(
					pids.map(async (pid) => {
						const root = `/proc/${pid}/fd`;
						const entries = await readdir(root).catch(() => []);
						if (entries.length > 2048)
							throw new Error("Too many process descriptors");
						return Promise.all(
							entries
								.slice(0, 2048)
								.map((fd) => readlink(`${root}/${fd}`).catch(() => "")),
						);
					}),
				)
			).flat();
		} else if (process.platform === "darwin") {
			const { stdout } = await execFileAsync(
				"/usr/sbin/lsof",
				["-nP", "-a", "-p", pids.join(","), "-Fn"],
				{ timeout: 2000, maxBuffer: 2 * 1024 * 1024 },
			);
			paths = stdout
				.split("\n")
				.filter((line) => line.startsWith("n"))
				.map((line) => line.slice(1));
		} else return null;
		return await resolveCodexRolloutFiles(paths);
	} catch {
		return null;
	}
}
