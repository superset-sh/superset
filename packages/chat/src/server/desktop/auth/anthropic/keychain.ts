import { execSync } from "node:child_process";
import { platform } from "node:os";

// Short-TTL cache around the `security` shell-out. Each `security
// find-generic-password` call can wake 1Password's Keychain integration
// and trigger a vault-authorization prompt; the renderer polls auth
// status from several queries (ModelPicker, ModelsSettings, setup flow)
// and re-runs on focus, so without caching every poll fans out to bursts
// of prompts. See #4622.
const KEYCHAIN_CACHE_TTL_MS = 5 * 60 * 1000;

export interface KeychainProbeResult {
	apiKey: string;
	service: "claude-cli" | "anthropic-api-key";
}

let cache: { value: KeychainProbeResult | null; expiresAt: number } | null =
	null;

export function clearAnthropicKeychainCache(): void {
	cache = null;
}

function readKeychainEntry(service: string, account?: string): string | null {
	const accountArg = account ? ` -a "${account}"` : "";
	try {
		const result = execSync(
			`security find-generic-password -s "${service}"${accountArg} -w 2>/dev/null`,
			{ encoding: "utf-8" },
		).trim();
		return result || null;
	} catch {
		return null;
	}
}

export function probeAnthropicKeychain(): KeychainProbeResult | null {
	if (platform() !== "darwin") return null;

	if (cache && cache.expiresAt > Date.now()) {
		return cache.value;
	}

	let resolved: KeychainProbeResult | null = null;
	const claudeCli = readKeychainEntry("claude-cli", "api-key");
	if (claudeCli) {
		resolved = { apiKey: claudeCli, service: "claude-cli" };
	} else {
		const anthropic = readKeychainEntry("anthropic-api-key");
		if (anthropic) {
			resolved = { apiKey: anthropic, service: "anthropic-api-key" };
		}
	}

	cache = {
		value: resolved,
		expiresAt: Date.now() + KEYCHAIN_CACHE_TTL_MS,
	};
	return resolved;
}
