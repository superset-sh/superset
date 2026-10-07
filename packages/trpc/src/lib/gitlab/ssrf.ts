import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class SsrfError extends Error {}

export function parseGitLabOrigin(input: string): URL {
	const raw = input.includes("://") ? input : `https://${input}`;
	try {
		if (/[\s\\]/.test(raw) || !/^https:\/\/[^/?#]+\/?$/i.test(raw))
			throw new Error();
		const url = new URL(raw);
		if (url.protocol !== "https:" || url.username || url.password)
			throw new Error();
		return url;
	} catch {
		throw new SsrfError(
			"GitLab host must use https without embedded credentials or a path",
		);
	}
}

export function trustedGitLabOrigin(
	raw: string | null | undefined = process.env.GITLAB_ISSUER,
): string | null {
	if (!raw) return null;
	try {
		const url = parseGitLabOrigin(raw);
		return isIP(url.hostname.replace(/^\[|\]$/g, "")) ? null : url.origin;
	} catch {
		return null;
	}
}

function ipv6Words(ip: string): number[] {
	const canonical = new URL(`https://[${ip}]`).hostname.slice(1, -1);
	const [left = "", right = ""] = canonical.split("::");
	const before = left
		? left.split(":").map((part) => Number.parseInt(part, 16))
		: [];
	const after = right
		? right.split(":").map((part) => Number.parseInt(part, 16))
		: [];
	return canonical.includes("::")
		? [...before, ...Array(8 - before.length - after.length).fill(0), ...after]
		: before;
}

function mappedIPv4(ip: string): string | null {
	if (isIP(ip) === 4) return ip;
	if (isIP(ip) !== 6) return null;
	const words = ipv6Words(ip);
	if (!words.slice(0, 5).every((word) => word === 0) || words[5] !== 0xffff)
		return null;
	const high = words[6] ?? 0;
	const low = words[7] ?? 0;
	return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function isBlockedIP(ip: string): boolean {
	const kind = isIP(ip);
	if (!kind) return true;
	const ipv4 = mappedIPv4(ip);
	if (ipv4) {
		const [a = 0, b = 0, c = 0] = ipv4.split(".").map(Number);
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			a >= 224 ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
			(a === 203 && b === 0 && c === 113)
		);
	}
	const words = ipv6Words(ip);
	const first = words[0] ?? 0;
	return (
		(first & 0xe000) !== 0x2000 ||
		first === 0x2002 ||
		(first === 0x2001 && ((words[1] ?? 0) < 0x200 || words[1] === 0xdb8)) ||
		first >= 0x3ff0
	);
}

function isMetadataIP(ip: string): boolean {
	return (
		mappedIPv4(ip) === "169.254.169.254" ||
		(isIP(ip) === 6 &&
			new URL(`https://[${ip}]`).hostname === "[fd00:ec2::254]")
	);
}

export async function resolveSafeGitLabAddresses(
	url: URL,
	resolve: (hostname: string) => Promise<LookupAddress[]> = (hostname) =>
		lookup(hostname, { all: true }),
	issuer: string | null | undefined = process.env.GITLAB_ISSUER,
): Promise<LookupAddress[]> {
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	const family = isIP(hostname);
	let addresses: LookupAddress[];
	try {
		addresses = family
			? [{ address: hostname, family }]
			: await resolve(hostname);
	} catch {
		throw new SsrfError("GitLab host did not resolve");
	}
	const trusted = !family && url.origin === trustedGitLabOrigin(issuer);
	if (
		!addresses.length ||
		addresses.some(
			({ address, family: kind }) =>
				!isIP(address) ||
				isIP(address) !== kind ||
				isMetadataIP(address) ||
				(!trusted && isBlockedIP(address)),
		)
	)
		throw new SsrfError("GitLab host not allowed");
	return addresses.map(({ address, family: kind }) => ({
		address,
		family: kind,
	}));
}

export async function assertSafeGitLabHost(
	host: string,
	resolve?: (hostname: string) => Promise<LookupAddress[]>,
	issuer?: string | null,
): Promise<string> {
	const url = parseGitLabOrigin(host);
	await resolveSafeGitLabAddresses(url, resolve, issuer);
	return url.origin;
}
