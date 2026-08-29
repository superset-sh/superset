/**
 * Deletes a secondary agent profile: its dir and (Claude, macOS) its
 * scoped keychain items, so no orphaned credentials linger. The system
 * default homes are never removable — the guards here are belt to the
 * router's braces (which only accepts currently discovered profiles).
 */

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { keychainServicesForConfigDir } from "./profiles";

const execFileAsync = promisify(execFile);

function protectedDirs(): Set<string> {
	const home = homedir();
	const dirs = new Set([
		home,
		join(home, ".claude"),
		join(home, ".config", "claude"),
		join(home, ".config"),
		join(home, ".codex"),
	]);
	if (process.env.CODEX_HOME) dirs.add(resolve(process.env.CODEX_HOME));
	return dirs;
}

export function assertRemovableProfileDir(dir: string): string {
	const resolved = resolve(dir);
	const home = homedir();
	if (!resolved.startsWith(home + sep)) {
		throw new Error(
			`Refusing to remove a profile outside the home dir: ${dir}`,
		);
	}
	if (protectedDirs().has(resolved)) {
		throw new Error(`Refusing to remove the system-default profile: ${dir}`);
	}
	return resolved;
}

export async function removeClaudeProfile(configDir: string): Promise<void> {
	const dir = assertRemovableProfileDir(configDir);
	if (platform() === "darwin") {
		// The CLI scopes keychain items by config-dir hash; drop every spelling
		// so no orphaned credential outlives the dir.
		for (const service of keychainServicesForConfigDir(dir)) {
			await execFileAsync("security", [
				"delete-generic-password",
				"-s",
				service,
			]).catch(() => {
				// Item absent for this spelling — nothing to delete.
			});
		}
	}
	await rm(dir, { recursive: true, force: true });
}

export async function removeCodexHome(home: string): Promise<void> {
	const dir = assertRemovableProfileDir(home);
	await rm(dir, { recursive: true, force: true });
}
