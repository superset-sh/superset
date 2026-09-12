import { describe, expect, it } from "bun:test";
import { createCipheriv, createHash } from "node:crypto";
import type { Cookie, Session } from "electron";
import {
	decryptCookieValue,
	deriveCookieKey,
	type ImportedCookie,
	importCookies,
	mapCookieRow,
	safeStorageServiceFor,
} from "./chrome-cookie-import";

const AES_IV = Buffer.alloc(16, 0x20);

/** Encrypts plaintext exactly as Chrome's macOS "v10" scheme does. */
function encryptV10(
	plaintext: string,
	key: Buffer,
	opts: { withHostPrefix?: boolean; host?: string } = {},
): Buffer {
	const body = opts.withHostPrefix
		? Buffer.concat([
				createHash("sha256")
					.update(opts.host ?? "example.com")
					.digest(),
				Buffer.from(plaintext, "utf8"),
			])
		: Buffer.from(plaintext, "utf8");
	const cipher = createCipheriv("aes-128-cbc", key, AES_IV);
	const enc = Buffer.concat([cipher.update(body), cipher.final()]);
	return Buffer.concat([Buffer.from("v10"), enc]);
}

const KEY = deriveCookieKey("test-password");

describe("safeStorageServiceFor", () => {
	it("maps browser keys to their Keychain service names", () => {
		expect(safeStorageServiceFor("chrome")).toBe("Chrome Safe Storage");
		expect(safeStorageServiceFor("brave")).toBe("Brave Safe Storage");
		expect(safeStorageServiceFor("arc")).toBe("Arc Safe Storage");
		expect(safeStorageServiceFor("unknown")).toBeNull();
	});
});

describe("decryptCookieValue", () => {
	it("decrypts a value carrying the 32-byte host-hash prefix", () => {
		const enc = encryptV10("session-token-abc", KEY, {
			withHostPrefix: true,
			host: "claude.ai",
		});
		expect(decryptCookieValue(enc, KEY)).toBe("session-token-abc");
	});

	it("decrypts a legacy value with no host prefix", () => {
		const enc = encryptV10("legacy-value", KEY);
		expect(decryptCookieValue(enc, KEY)).toBe("legacy-value");
	});

	it("handles a long prefixed value without truncating it", () => {
		const long = "x".repeat(200);
		const enc = encryptV10(long, KEY, { withHostPrefix: true });
		expect(decryptCookieValue(enc, KEY)).toBe(long);
	});

	it("returns null for non-v10 (e.g. app-bound v20) values", () => {
		const v20 = Buffer.concat([Buffer.from("v20"), Buffer.alloc(32, 1)]);
		expect(decryptCookieValue(v20, KEY)).toBeNull();
	});

	it("returns null when the stored value is text rather than a buffer", () => {
		// SQLite is dynamically typed: a row that stored encrypted_value as TEXT
		// comes back from better-sqlite3 as a string, which has no .subarray.
		const text = "GS1:some-plain-text-value" as unknown as Buffer;
		expect(decryptCookieValue(text, KEY)).toBeNull();
	});

	it("returns null when decrypted with the wrong key", () => {
		const enc = encryptV10("secret", KEY, { withHostPrefix: true });
		expect(
			decryptCookieValue(enc, deriveCookieKey("other-password")),
		).toBeNull();
	});
});

describe("mapCookieRow", () => {
	const base = {
		host_key: ".claude.ai",
		name: "sessionKey",
		value: "",
		path: "/",
		expires_utc: 13426962940885784,
		is_secure: 1,
		is_httponly: 1,
		samesite: 2,
		is_persistent: 1,
	};

	it("builds an Electron cookie from a decrypted row", () => {
		const row = {
			...base,
			encrypted_value: encryptV10("abc123", KEY, {
				withHostPrefix: true,
				host: "claude.ai",
			}),
		};
		const cookie = mapCookieRow(row, KEY);
		expect(cookie).not.toBeNull();
		expect(cookie?.url).toBe("https://claude.ai/");
		expect(cookie?.name).toBe("sessionKey");
		expect(cookie?.value).toBe("abc123");
		expect(cookie?.domain).toBe(".claude.ai");
		expect(cookie?.secure).toBe(true);
		expect(cookie?.httpOnly).toBe(true);
		expect(cookie?.sameSite).toBe("strict");
		expect(cookie?.expirationDate).toBeGreaterThan(1_600_000_000);
	});

	it("keeps a host-only cookie host-only by leaving domain unset", () => {
		// Chrome stores a cookie set without `Domain` under its bare host.
		// Electron turns any `domain` it is handed into a `.host` domain
		// cookie, so the bare host must travel in `url` alone.
		const row = {
			...base,
			host_key: "accounts.google.com",
			name: "LSID",
			encrypted_value: encryptV10("lsid", KEY, {
				withHostPrefix: true,
				host: "accounts.google.com",
			}),
		};
		const cookie = mapCookieRow(row, KEY);
		expect(cookie?.url).toBe("https://accounts.google.com/");
		expect(cookie?.domain).toBeUndefined();
		expect("domain" in (cookie ?? {})).toBe(false);
	});

	it("omits expirationDate for session cookies", () => {
		const row = {
			...base,
			is_persistent: 0,
			expires_utc: 0,
			encrypted_value: encryptV10("s", KEY, { withHostPrefix: true }),
		};
		expect(mapCookieRow(row, KEY)?.expirationDate).toBeUndefined();
	});

	it("drops rows whose value can't be decrypted", () => {
		const row = {
			...base,
			encrypted_value: Buffer.concat([Buffer.from("v20"), Buffer.alloc(48, 7)]),
		};
		expect(mapCookieRow(row, KEY)).toBeNull();
	});

	it("drops a row whose stored value is text rather than a buffer", () => {
		const row = {
			...base,
			encrypted_value: "GS1:some-plain-text-value" as unknown as Buffer,
		};
		expect(mapCookieRow(row, KEY)).toBeNull();
	});
});

/** RFC 6265 domain-match, as Chromium applies it when picking request cookies. */
function domainCovers(cookieDomain: string, host: string): boolean {
	if (!cookieDomain.startsWith(".")) return cookieDomain === host;
	const bare = cookieDomain.slice(1);
	return host === bare || host.endsWith(`.${bare}`);
}

/** RFC 6265 path-match. */
function pathCovers(cookiePath: string, requestPath: string): boolean {
	if (cookiePath === requestPath) return true;
	if (!requestPath.startsWith(cookiePath)) return false;
	return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}

/**
 * In-memory stand-in for `session.cookies`. Mirrors the one behaviour the
 * importer depends on: `remove(url, name)` deletes every cookie of that name
 * the URL would receive — host-only, `.host` twin, parent-domain and
 * shorter-path cookies alike (verified against Electron 41).
 */
function fakeSession(initial: Cookie[] = []) {
	const jar: Cookie[] = [...initial];
	const removed: Array<[string, string]> = [];
	const set: ImportedCookie[] = [];
	const rejectNames = new Set<string>();
	const rejectValues = new Set<string>();
	const cookies = {
		get: async () => [...jar],
		remove: async (url: string, name: string) => {
			removed.push([url, name]);
			const { hostname, pathname } = new URL(url);
			for (let i = jar.length - 1; i >= 0; i--) {
				const c = jar[i] as Cookie;
				if (
					c.name === name &&
					domainCovers(c.domain ?? "", hostname) &&
					pathCovers(c.path ?? "/", pathname)
				) {
					jar.splice(i, 1);
				}
			}
		},
		set: async (cookie: ImportedCookie) => {
			if (rejectNames.has(cookie.name) || rejectValues.has(cookie.value)) {
				throw new Error("rejected");
			}
			set.push(cookie);
			const domain = cookie.domain ?? new URL(cookie.url).hostname;
			const idx = jar.findIndex(
				(c) =>
					c.name === cookie.name &&
					c.domain === domain &&
					c.path === cookie.path,
			);
			const stored: Cookie = {
				name: cookie.name,
				value: cookie.value,
				domain,
				hostOnly: cookie.domain === undefined,
				path: cookie.path,
				secure: cookie.secure,
				httpOnly: cookie.httpOnly,
				session: cookie.expirationDate === undefined,
				sameSite: cookie.sameSite,
				expirationDate: cookie.expirationDate,
			};
			if (idx === -1) jar.push(stored);
			else jar[idx] = stored;
		},
	};
	return {
		session: { cookies } as unknown as Session,
		jar,
		removed,
		set,
		rejectNames,
		rejectValues,
	};
}

function jarView(jar: Cookie[]): Array<[string, string, string]> {
	return [...jar]
		.map((c): [string, string, string] => [c.domain ?? "", c.name, c.value])
		.sort((a, b) => a.join().localeCompare(b.join()));
}

function stored(
	domain: string,
	name: string,
	value: string,
	overrides: Partial<Cookie> = {},
): Cookie {
	return {
		name,
		value,
		domain,
		hostOnly: !domain.startsWith("."),
		path: "/",
		secure: true,
		httpOnly: true,
		session: false,
		sameSite: "lax",
		expirationDate: 1_900_000_000,
		...overrides,
	};
}

function imported(
	host: string,
	name: string,
	value: string,
	overrides: Partial<ImportedCookie> = {},
): ImportedCookie {
	const bare = host.replace(/^\./, "");
	return {
		url: `https://${bare}/`,
		name,
		value,
		path: "/",
		secure: true,
		httpOnly: true,
		sameSite: "lax",
		expirationDate: 1_900_000_000,
		...(host.startsWith(".") && { domain: host }),
		...overrides,
	};
}

describe("importCookies", () => {
	it("replaces a stale .host twin left by an earlier import", async () => {
		const s = fakeSession([
			stored(".accounts.google.com", "LSID", "stale-import"),
			stored("accounts.google.com", "LSID", "set-by-google"),
		]);
		const result = await importCookies(s.session, [
			imported("accounts.google.com", "LSID", "fresh"),
		]);
		expect(result).toEqual({ imported: 1, skipped: 0 });
		expect(s.removed).toEqual([["https://accounts.google.com/", "LSID"]]);
		expect(s.jar).toHaveLength(1);
		expect(s.jar[0]).toMatchObject({
			domain: "accounts.google.com",
			hostOnly: true,
			value: "fresh",
		});
	});

	it("keeps both when the source profile itself holds the pair", async () => {
		const s = fakeSession([stored(".github.com", "tz", "old")]);
		await importCookies(s.session, [
			imported("github.com", "tz", "host"),
			imported(".github.com", "tz", "domain"),
		]);
		expect(s.removed).toEqual([]);
		expect(s.jar.map((c) => [c.domain, c.value])).toEqual([
			[".github.com", "domain"],
			["github.com", "host"],
		]);
	});

	it("does not touch a jar with no twin, and honours the cookie path", async () => {
		const s = fakeSession([stored(".example.com", "a", "1", { path: "/x" })]);
		await importCookies(s.session, [
			imported("example.com", "a", "2", { path: "/" }),
		]);
		expect(s.removed).toEqual([]);
		expect(s.jar).toHaveLength(2);
	});

	it("drops twins before writing, so restored collateral takes the source's value", async () => {
		const s = fakeSession([
			stored(".www.google.com", "OTZ", "stale-import"),
			stored("www.google.com", "OTZ", "set-by-google"),
			stored(".google.com", "OTZ", "old-parent"),
		]);
		await importCookies(s.session, [
			imported(".google.com", "OTZ", "new-parent"),
			imported("www.google.com", "OTZ", "fresh"),
		]);
		expect(jarView(s.jar)).toEqual([
			[".google.com", "OTZ", "new-parent"],
			["www.google.com", "OTZ", "fresh"],
		]);
	});

	it("puts back a shorter-path cookie the twin removal took with it", async () => {
		const s = fakeSession([
			stored(".mail.google.com", "COMPASS", "stale", { path: "/mail" }),
			stored("mail.google.com", "COMPASS", "root", { path: "/" }),
		]);
		await importCookies(s.session, [
			imported("mail.google.com", "COMPASS", "fresh", { path: "/mail" }),
		]);
		expect(s.removed).toEqual([["https://mail.google.com/mail", "COMPASS"]]);
		expect(s.jar.map((c) => [c.domain, c.path, c.value]).sort()).toEqual([
			["mail.google.com", "/", "root"],
			["mail.google.com", "/mail", "fresh"],
		]);
	});

	it("does not resurrect a twin that a later slot's removal also hits", async () => {
		const s = fakeSession([
			stored(".www.google.com", "OTZ", "stale-a"),
			stored(".x.www.google.com", "OTZ", "stale-b"),
		]);
		await importCookies(s.session, [
			imported("www.google.com", "OTZ", "host-a"),
			imported("x.www.google.com", "OTZ", "host-b"),
		]);
		expect(jarView(s.jar)).toEqual([
			["www.google.com", "OTZ", "host-a"],
			["x.www.google.com", "OTZ", "host-b"],
		]);
	});

	it("restores the whole slot, twin included, when a collateral re-set fails", async () => {
		const s = fakeSession([
			stored(".www.google.com", "OTZ", "stale"),
			stored(".google.com", "OTZ", "parent-rejected"),
		]);
		s.rejectValues.add("parent-rejected");
		s.rejectNames.add("unrelated");
		await importCookies(s.session, [
			imported("www.google.com", "OTZ", "fresh"),
		]);
		// The parent could not be put back, so the twin was, and the import
		// then wrote the fresh host-only cookie next to it.
		expect(jarView(s.jar)).toEqual([
			[".www.google.com", "OTZ", "stale"],
			["www.google.com", "OTZ", "fresh"],
		]);
	});

	it("skips Superset's own hosts, host-only or domain", async () => {
		const s = fakeSession();
		const result = await importCookies(s.session, [
			imported("app.superset.sh", "session", "x"),
			imported(".superset.sh", "session", "x"),
			imported("localhost", "dev", "x", { secure: false }),
			imported("example.com", "ok", "x"),
		]);
		expect(result).toEqual({ imported: 1, skipped: 3 });
		expect(s.set.map((c) => c.name)).toEqual(["ok"]);
	});

	it("counts a cookie the session rejects as skipped", async () => {
		const s = fakeSession();
		s.rejectNames.add("bad");
		const result = await importCookies(s.session, [
			imported("example.com", "bad", "x"),
			imported("example.com", "good", "x"),
		]);
		expect(result).toEqual({ imported: 1, skipped: 1 });
	});
});
