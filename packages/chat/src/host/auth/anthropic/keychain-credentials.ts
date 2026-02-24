import { execSync } from "node:child_process";
import { platform } from "node:os";
import type { ClaudeCredentials } from "./types";

export function getCredentialsFromKeychain(): ClaudeCredentials | null {
	if (platform() !== "darwin") {
		return null;
	}

	try {
		const result = execSync(
			'security find-generic-password -s "claude-cli" -a "api-key" -w 2>/dev/null',
			{ encoding: "utf-8" },
		).trim();

		if (result) {
			console.log("[claude/auth] Found credentials in macOS Keychain");
			return { apiKey: result, source: "keychain", kind: "apiKey" };
		}
	} catch {
		// Not found in keychain
	}

	try {
		const result = execSync(
			'security find-generic-password -s "anthropic-api-key" -w 2>/dev/null',
			{ encoding: "utf-8" },
		).trim();

		if (result) {
			console.log(
				"[claude/auth] Found credentials in macOS Keychain (anthropic-api-key)",
			);
			return { apiKey: result, source: "keychain", kind: "apiKey" };
		}
	} catch {
		// Not found in keychain
	}

	return null;
}
