import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Cloud metadata endpoints that must never be reachable from server-side fetches. */
const METADATA_IPS = new Set(["169.254.169.254", "fd00:ec2::254"]);

export class SsrfError extends Error {}

function isPrivateIPv4(ip: string): boolean {
	const parts = ip.split(".").map(Number);
	if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
	const [a, b] = parts as [number, number, number, number];
	if (a === 0) return true; // 0.0.0.0/8
	if (a === 10) return true; // RFC-1918
	if (a === 127) return true; // loopback
	if (a === 169 && b === 254) return true; // link-local (incl. metadata)
	if (a === 172 && b >= 16 && b <= 31) return true; // RFC-1918
	if (a === 192 && b === 168) return true; // RFC-1918
	if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
	return false;
}

function isPrivateIPv6(ip: string): boolean {
	const lower = ip.toLowerCase();
	if (lower === "::1" || lower === "::") return true; // loopback / unspecified
	if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
	if (lower.startsWith("fe80")) return true; // link-local
	if (lower.startsWith("::ffff:")) {
		const v4 = lower.slice("::ffff:".length);
		if (isIP(v4) === 4) return isPrivateIPv4(v4);
	}
	return false;
}

/** True if an IP literal is private/loopback/link-local/metadata (must be blocked). */
export function isBlockedIP(ip: string): boolean {
	if (METADATA_IPS.has(ip.toLowerCase())) return true;
	const kind = isIP(ip);
	if (kind === 4) return isPrivateIPv4(ip);
	if (kind === 6) return isPrivateIPv6(ip);
	return true; // not a valid IP → block
}

/**
 * Validates a user-supplied GitLab host before the server makes requests to it
 * (spec §7). Enforces https and rejects hosts that resolve to loopback /
 * link-local / RFC-1918 / cloud-metadata addresses. Call at connect time AND
 * before each request lifecycle — it re-resolves DNS to blunt rebinding.
 * Returns the normalized https origin (e.g. "https://gitlab.com").
 */
export async function assertSafeGitLabHost(host: string): Promise<string> {
	let url: URL;
	try {
		url = new URL(host.includes("://") ? host : `https://${host}`);
	} catch {
		throw new SsrfError("Invalid GitLab host");
	}
	if (url.protocol !== "https:") {
		throw new SsrfError("GitLab host must use https");
	}

	const hostname = url.hostname;
	if (isIP(hostname)) {
		if (isBlockedIP(hostname)) throw new SsrfError("GitLab host not allowed");
	} else {
		const results = await lookup(hostname, { all: true });
		if (results.length === 0) {
			throw new SsrfError("GitLab host did not resolve");
		}
		for (const { address } of results) {
			if (isBlockedIP(address)) throw new SsrfError("GitLab host not allowed");
		}
	}
	return url.origin;
}
