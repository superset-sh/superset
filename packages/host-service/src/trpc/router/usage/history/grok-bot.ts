/**
 * Grok Bot keeps no usage on disk; its turns arrive in Cursor's usage-event
 * feed (see cursor.ts). The desktop app caches the Bot roster in
 * `sand-client-persistence/<base32 key>.blob`, which names the agent ids
 * those events carry as `conversationId`.
 */

import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const ROSTER_KEY = /^sand\.client\.slice\.account\..+\.roster\.last-roster$/;
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** Windows installs from before the rename keep `%APPDATA%\Sand` until the
 * app migrates it on an update. */
export function grokBotDataDirs(): string[] {
	if (process.platform === "darwin") {
		return [join(homedir(), "Library", "Application Support", "Grok Bot")];
	}
	if (process.platform === "win32") {
		const appData =
			process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
		return [join(appData, "Grok Bot"), join(appData, "Sand")];
	}
	return [
		join(
			process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"),
			"Grok Bot",
		),
	];
}

export function decodeBase32(encoded: string): string | null {
	let bits = 0;
	let value = 0;
	const bytes: number[] = [];
	for (const char of encoded.toLowerCase().replace(/=+$/, "")) {
		const index = BASE32_ALPHABET.indexOf(char);
		if (index === -1) return null;
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			bytes.push((value >> bits) & 0xff);
		}
	}
	return Buffer.from(bytes).toString("utf-8");
}

interface RosterRow {
	id?: unknown;
	name?: unknown;
	memberIds?: unknown;
}

/** Bot agent id → Bot name, across every account signed in to the app. */
export async function readGrokBotAgents(
	dataDirs: readonly string[] = grokBotDataDirs(),
): Promise<Map<string, string>> {
	const agents = new Map<string, string>();
	for (const dataDir of dataDirs) {
		await readRoster(join(dataDir, "sand-client-persistence"), agents);
	}
	return agents;
}

async function readRoster(
	persistenceDir: string,
	agents: Map<string, string>,
): Promise<void> {
	let files: string[];
	try {
		files = await readdir(persistenceDir);
	} catch {
		return;
	}
	for (const file of files) {
		if (!file.endsWith(".blob")) continue;
		const key = decodeBase32(file.slice(0, -".blob".length));
		if (!key || !ROSTER_KEY.test(key)) continue;
		let rows: unknown;
		try {
			const parsed = JSON.parse(
				await readFile(join(persistenceDir, file), "utf-8"),
			) as { value?: { rows?: unknown } };
			rows = parsed.value?.rows;
		} catch {
			continue;
		}
		if (!Array.isArray(rows)) continue;
		for (const row of rows as RosterRow[]) {
			if (typeof row.id !== "string") continue;
			agents.set(row.id, typeof row.name === "string" ? row.name : "");
			if (!Array.isArray(row.memberIds)) continue;
			for (const memberId of row.memberIds) {
				if (typeof memberId === "string" && !agents.has(memberId)) {
					agents.set(memberId, "");
				}
			}
		}
	}
}
