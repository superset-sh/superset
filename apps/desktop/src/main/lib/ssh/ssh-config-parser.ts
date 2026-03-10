import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { SshHostConfig } from "./types";

interface ParsedHostBlock {
	host: string;
	hostname?: string;
	user?: string;
	port?: number;
	identityFile?: string;
}

/**
 * Parse the user's ~/.ssh/config file and return an array of SshHostConfig objects.
 * Wildcard hosts (Host *) are skipped.
 */
export async function parseSshConfig(): Promise<SshHostConfig[]> {
	const configPath = path.join(os.homedir(), ".ssh", "config");

	let content: string;
	try {
		content = await fs.readFile(configPath, "utf8");
	} catch {
		// No SSH config file found — return empty list
		return [];
	}

	const blocks = parseHostBlocks(content);
	const configs: SshHostConfig[] = [];

	for (const block of blocks) {
		// Skip wildcard hosts
		if (block.host === "*" || block.host.includes("*")) {
			continue;
		}

		const hostname = block.hostname ?? block.host;
		const username = block.user ?? os.userInfo().username;
		const port = block.port ?? 22;
		const hasIdentityFile = !!block.identityFile;

		const config: SshHostConfig = {
			id: randomUUID(),
			label: block.host,
			hostname,
			port,
			username,
			authMethod: hasIdentityFile ? "privateKey" : "agent",
			...(hasIdentityFile && {
				privateKeyPath: resolveKeyPath(block.identityFile!),
			}),
		};

		configs.push(config);
	}

	return configs;
}

function parseHostBlocks(content: string): ParsedHostBlock[] {
	const lines = content.split(/\r?\n/);
	const blocks: ParsedHostBlock[] = [];
	let current: ParsedHostBlock | null = null;

	for (const raw of lines) {
		const line = raw.trim();

		// Skip blank lines and comments
		if (!line || line.startsWith("#")) {
			continue;
		}

		const spaceIdx = line.indexOf(" ");
		const eqIdx = line.indexOf("=");
		let sepIdx: number;
		if (spaceIdx === -1 && eqIdx === -1) continue;
		if (spaceIdx === -1) sepIdx = eqIdx;
		else if (eqIdx === -1) sepIdx = spaceIdx;
		else sepIdx = Math.min(spaceIdx, eqIdx);

		const key = line.slice(0, sepIdx).toLowerCase();
		const value = line.slice(sepIdx + 1).trim();

		if (key === "host") {
			if (current) {
				blocks.push(current);
			}
			current = { host: value };
			continue;
		}

		if (!current) continue;

		switch (key) {
			case "hostname":
				current.hostname = value;
				break;
			case "user":
				current.user = value;
				break;
			case "port": {
				const parsed = parseInt(value, 10);
				if (!Number.isNaN(parsed)) {
					current.port = parsed;
				}
				break;
			}
			case "identityfile":
				current.identityFile = value;
				break;
		}
	}

	if (current) {
		blocks.push(current);
	}

	return blocks;
}

function resolveKeyPath(keyPath: string): string {
	if (keyPath.startsWith("~")) {
		return path.join(os.homedir(), keyPath.slice(1));
	}
	return keyPath;
}
