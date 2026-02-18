/**
 * SSH Key Resolver
 *
 * Discovers and loads SSH keys in priority order:
 * 1. SSH agent (SSH_AUTH_SOCK)
 * 2. Explicit identityFile from config
 * 3. ~/.ssh/id_ed25519
 * 4. ~/.ssh/id_rsa
 * 5. ~/.ssh/id_ecdsa
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_KEY_NAMES = ["id_ed25519", "id_rsa", "id_ecdsa"];

export interface ResolvedSSHAuth {
	/** Use SSH agent for authentication */
	agent?: string;
	/** Private key contents */
	privateKey?: Buffer;
	/** Path to the private key file (for diagnostics) */
	keyPath?: string;
}

/**
 * Resolve SSH authentication credentials in priority order.
 */
export function resolveSSHAuth(options?: {
	identityFile?: string;
	useAgent?: boolean;
}): ResolvedSSHAuth {
	const { identityFile, useAgent = true } = options ?? {};

	// 1. SSH agent
	if (useAgent && process.env.SSH_AUTH_SOCK) {
		return { agent: process.env.SSH_AUTH_SOCK };
	}

	// 2. Explicit identity file
	if (identityFile) {
		const resolved = identityFile.startsWith("~")
			? join(homedir(), identityFile.slice(1))
			: identityFile;
		if (existsSync(resolved)) {
			return {
				privateKey: readFileSync(resolved),
				keyPath: resolved,
			};
		}
	}

	// 3. Default key locations
	const sshDir = join(homedir(), ".ssh");
	for (const keyName of DEFAULT_KEY_NAMES) {
		const keyPath = join(sshDir, keyName);
		if (existsSync(keyPath)) {
			return {
				privateKey: readFileSync(keyPath),
				keyPath,
			};
		}
	}

	return {};
}

/**
 * List available SSH keys in ~/.ssh (excluding .pub, known_hosts, config, etc.)
 */
export function listSSHKeys(): Array<{ name: string; path: string }> {
	const sshDir = join(homedir(), ".ssh");
	const keys: Array<{ name: string; path: string }> = [];

	try {
		const { readdirSync } = require("node:fs");
		const entries = readdirSync(sshDir) as string[];
		const exclude = new Set([
			"known_hosts",
			"known_hosts.old",
			"config",
			"authorized_keys",
			"environment",
		]);

		for (const entry of entries) {
			if (entry.startsWith(".")) continue;
			if (entry.endsWith(".pub")) continue;
			if (exclude.has(entry)) continue;

			const fullPath = join(sshDir, entry);
			try {
				const { statSync } = require("node:fs");
				const stat = statSync(fullPath);
				if (stat.isFile()) {
					keys.push({ name: entry, path: fullPath });
				}
			} catch {
				// Skip inaccessible files
			}
		}
	} catch {
		// ~/.ssh doesn't exist or isn't readable
	}

	return keys;
}

/**
 * Check if SSH agent is available.
 */
export function isSSHAgentAvailable(): boolean {
	return !!process.env.SSH_AUTH_SOCK;
}
