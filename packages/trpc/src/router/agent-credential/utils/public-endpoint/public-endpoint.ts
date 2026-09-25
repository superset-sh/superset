import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Whether an address belongs to a range that is only meaningful inside a
 * network — loopback, private, link-local, carrier-grade NAT, multicast. The
 * server probes caller-supplied endpoints with a credential attached, so a
 * destination that resolves into one of these would turn that probe into a
 * way to reach services the caller cannot reach themselves.
 */
export function isRestrictedAddress(address: string): boolean {
	const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
	if (isIP(v4) === 4) {
		const [a, b] = v4.split(".").map(Number);
		if (a === undefined || b === undefined) return true;
		if (a === 0 || a === 10 || a === 127) return true;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 100 && b >= 64 && b <= 127) return true;
		if (a === 192 && b === 0) return true;
		if (a === 198 && (b === 18 || b === 19)) return true;
		if (a >= 224) return true;
		return false;
	}
	const v6 = address.toLowerCase().split("%")[0] ?? "";
	if (v6 === "::1" || v6 === "::") return true;
	if (/^f[cd]/.test(v6)) return true;
	if (/^fe[89ab]/.test(v6)) return true;
	if (v6.startsWith("ff")) return true;
	return false;
}

export type EndpointCheck =
	| { ok: true }
	| { ok: false; reason: "not-https" | "unresolvable" | "restricted" };

/**
 * Rejects an endpoint the server should not be asked to call. Resolution is
 * advisory — a name can move between this check and the request — so callers
 * also refuse redirects rather than following them somewhere else.
 */
export async function checkPublicEndpoint(url: string): Promise<EndpointCheck> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false, reason: "not-https" };
	}
	if (parsed.protocol !== "https:") return { ok: false, reason: "not-https" };

	const host = parsed.hostname.replace(/^\[|\]$/g, "");
	if (isIP(host)) {
		return isRestrictedAddress(host)
			? { ok: false, reason: "restricted" }
			: { ok: true };
	}
	let addresses: Array<{ address: string }>;
	try {
		addresses = await lookup(host, { all: true });
	} catch {
		return { ok: false, reason: "unresolvable" };
	}
	if (!addresses.length) return { ok: false, reason: "unresolvable" };
	if (addresses.some((entry) => isRestrictedAddress(entry.address))) {
		return { ok: false, reason: "restricted" };
	}
	return { ok: true };
}
