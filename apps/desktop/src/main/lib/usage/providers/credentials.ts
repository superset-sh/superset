import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Reads and JSON-parses a credential file. Returns null if missing/invalid. */
export async function readJsonFile<T>(path: string): Promise<T | null> {
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch {
		return null;
	}
	try {
		return JSON.parse(content) as T;
	} catch {
		return null;
	}
}

/** Decodes a JWT payload without verifying its signature. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
	const parts = token.split(".");
	if (parts.length < 2) return null;
	try {
		const json = Buffer.from(parts[1], "base64url").toString("utf8");
		const parsed = JSON.parse(json);
		return typeof parsed === "object" && parsed !== null ? parsed : null;
	} catch {
		return null;
	}
}

/** macOS Keychain lookup; returns null off-darwin or when the item is absent. */
export async function readKeychainSecret(
	service: string,
): Promise<string | null> {
	if (process.platform !== "darwin") return null;
	try {
		const { stdout } = await execFileAsync("security", [
			"find-generic-password",
			"-s",
			service,
			"-w",
		]);
		const trimmed = stdout.trim();
		return trimmed.length > 0 ? trimmed : null;
	} catch {
		return null;
	}
}

/** Resolves an executable's absolute path via `which`, or null if not found. */
export async function whichBinary(name: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync("which", [name]);
		const path = stdout.trim().split("\n")[0];
		return path.length > 0 ? path : null;
	} catch {
		return null;
	}
}
