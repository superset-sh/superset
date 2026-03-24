import fs from "node:fs";
import os from "node:os";

export const MACOS_SYSTEM_CERT_FILE = "/etc/ssl/cert.pem";

/**
 * Append a key=value pair to a GODEBUG string if not already present.
 * GODEBUG values are comma-separated (e.g. "gctrace=1,x509usefallbackroots=1").
 */
export function appendGoDebug(
	existing: string | undefined,
	entry: string,
): string {
	if (!existing) return entry;
	if (existing.split(",").some((e) => e.trim() === entry)) return existing;
	return `${existing},${entry}`;
}

/**
 * On macOS, Electron child processes can't access the Keychain for TLS cert
 * verification, causing "x509: OSStatus -26276" in CGO-enabled Go binaries
 * (e.g. `gh` from Homebrew). Sets SSL_CERT_FILE for file-based cert roots and
 * GODEBUG=x509usefallbackroots=1 so Go falls back to its own verifier when
 * the Security framework call fails.
 *
 * Mutates and returns the given env record. No-op on non-macOS platforms.
 */
export function applyMacosTlsFix(env: Record<string, string>): Record<string, string> {
	if (os.platform() !== "darwin") return env;
	try {
		if (!fs.existsSync(MACOS_SYSTEM_CERT_FILE)) return env;
	} catch {
		return env;
	}
	if (!env.SSL_CERT_FILE) {
		env.SSL_CERT_FILE = MACOS_SYSTEM_CERT_FILE;
	}
	env.GODEBUG = appendGoDebug(env.GODEBUG, "x509usefallbackroots=1");
	return env;
}
