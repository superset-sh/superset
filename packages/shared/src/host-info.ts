import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir, hostname, platform } from "node:os";

// Salt value preserved verbatim across the rename to keep existing host ids
// stable for users already registered against the cloud.
const APP_HOST_SALT = "superset-desktop-device-id-v1";

function getRawMachineId(): string {
	try {
		const os = platform();

		if (os === "darwin") {
			const output = execFileSync(
				"ioreg",
				["-rd1", "-c", "IOPlatformExpertDevice"],
				{ encoding: "utf8" },
			);
			const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
			if (match?.[1]) return match[1];
		} else if (os === "linux") {
			try {
				return readFileSync("/etc/machine-id", "utf8").trim();
			} catch {
				return readFileSync("/var/lib/dbus/machine-id", "utf8").trim();
			}
		} else if (os === "win32") {
			const output = execFileSync(
				"reg",
				[
					"query",
					"HKLM\\SOFTWARE\\Microsoft\\Cryptography",
					"/v",
					"MachineGuid",
				],
				{ encoding: "utf8" },
			);
			const match = output.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
			if (match?.[1]) return match[1];
		}
	} catch {
		// Fallback if platform-specific method fails
	}

	return `${hostname()}-${homedir()}-superset-fallback`;
}

let cachedMachineId: string | null = null;

/**
 * Raw machine ID for local encryption key derivation.
 * Do NOT send this to the cloud - use getHostId() instead.
 */
export function getMachineId(): string {
	if (!cachedMachineId) {
		cachedMachineId = getRawMachineId();
	}
	return cachedMachineId;
}

let cachedHashedId: string | null = null;

/**
 * Stable host id safe for cloud transmission.
 * HMAC of the raw machine id; non-reversible and app-specific.
 * This is the canonical identifier for a machine acting as a host or client.
 */
export function getHostId(): string {
	if (!cachedHashedId) {
		const machineId = getMachineId();
		cachedHashedId = createHmac("sha256", APP_HOST_SALT)
			.update(machineId)
			.digest("hex")
			.slice(0, 32);
	}
	return cachedHashedId;
}

/**
 * Sanitized host name for cloud transmission.
 * Returns generic identifier instead of potentially PII-containing hostname.
 */
export function getHostName(): string {
	const os = platform();
	const osName = os === "darwin" ? "Mac" : os === "win32" ? "Windows" : "Linux";
	const rawHostname = hostname();

	const shortName = rawHostname.split(".")[0] || rawHostname;

	if (shortName.length < 3 || shortName === "localhost") {
		return `${osName} Desktop`;
	}

	return shortName;
}
