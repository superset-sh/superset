import { execFile } from "node:child_process";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import type { Session } from "electron";

const execFileAsync = promisify(execFile);

/**
 * Chrome's `expires_utc` is microseconds since 1601-01-01 (FILETIME epoch);
 * this offset in milliseconds bridges to the Unix epoch.
 */
const CHROME_EPOCH_OFFSET_MS = 11_644_473_600_000;

/** Fixed parameters of Chrome's macOS "v10" cookie encryption. */
const KDF_SALT = "saltysalt";
const KDF_ITERATIONS = 1003;
const KDF_KEY_LENGTH = 16;
const AES_IV = Buffer.alloc(16, 0x20); // 16 spaces
/** Newer Chrome prepends a 32-byte SHA-256(host) to the plaintext. */
const HOST_HASH_PREFIX_LENGTH = 32;

/** Keychain service that stores each browser's cookie-encryption password. */
const SAFE_STORAGE_SERVICE: Record<string, string> = {
	chrome: "Chrome Safe Storage",
	"chrome-beta": "Chrome Safe Storage",
	"chrome-canary": "Chrome Safe Storage",
	chromium: "Chromium Safe Storage",
	edge: "Microsoft Edge Safe Storage",
	brave: "Brave Safe Storage",
	arc: "Arc Safe Storage",
	dia: "Dia Safe Storage",
	comet: "Comet Safe Storage",
};

export interface ImportedCookie {
	url: string;
	name: string;
	value: string;
	/**
	 * Only set for a cookie Chrome stored with a `Domain` attribute (a leading
	 * dot in `host_key`). Electron normalizes any `domain` it is given into a
	 * domain cookie, so a host-only cookie must leave it out and let `url`
	 * carry the host — see `mapCookieRow`.
	 */
	domain?: string;
	path: string;
	secure: boolean;
	httpOnly: boolean;
	/** Unix seconds; omitted for session cookies. */
	expirationDate?: number;
	sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
}

interface ChromeCookieRow {
	host_key: string;
	name: string;
	value: string;
	encrypted_value: Buffer;
	path: string;
	expires_utc: number;
	is_secure: number;
	is_httponly: number;
	samesite: number;
	is_persistent: number;
}

export function safeStorageServiceFor(browserKey: string): string | null {
	return SAFE_STORAGE_SERVICE[browserKey] ?? null;
}

/**
 * Reads a browser's cookie-encryption password from the macOS Keychain. The
 * first read for a given app triggers a Keychain authorization prompt. Returns
 * null off macOS, on denial, or when the item is missing.
 */
export async function readSafeStorageKey(
	browserKey: string,
): Promise<string | null> {
	if (process.platform !== "darwin") return null;
	const service = safeStorageServiceFor(browserKey);
	if (!service) return null;
	try {
		const { stdout } = await execFileAsync(
			"security",
			["find-generic-password", "-s", service, "-w"],
			{ timeout: 10_000 },
		);
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

/** Derives the AES key from the Keychain password. */
export function deriveCookieKey(safeStorageKey: string): Buffer {
	return pbkdf2Sync(
		safeStorageKey,
		KDF_SALT,
		KDF_ITERATIONS,
		KDF_KEY_LENGTH,
		"sha1",
	);
}

/**
 * Decrypts one Chrome "v10" cookie value. Returns null for values in any other
 * scheme (e.g. app-bound "v20", which can't be decrypted outside the browser)
 * or when the plaintext isn't valid UTF-8.
 */
export function decryptCookieValue(
	encryptedValue: Buffer,
	key: Buffer,
): string | null {
	try {
		// Inside the guard: SQLite is dynamically typed, so a row that stored
		// encrypted_value as TEXT arrives as a string, which has no .subarray.
		if (
			encryptedValue.length < 3 ||
			encryptedValue.subarray(0, 3).toString() !== "v10"
		) {
			return null;
		}
		const decipher = createDecipheriv("aes-128-cbc", key, AES_IV);
		decipher.setAutoPadding(false);
		const padded = Buffer.concat([
			decipher.update(encryptedValue.subarray(3)),
			decipher.final(),
		]);
		// Strip PKCS#7 padding.
		const padLength = padded[padded.length - 1];
		if (padLength < 1 || padLength > 16 || padLength > padded.length)
			return null;
		const unpadded = padded.subarray(0, padded.length - padLength);
		// Older Chrome stores the plaintext directly; newer Chrome prepends a
		// 32-byte SHA-256(host). The prefix is random bytes, so the raw decode
		// fails the text check and we fall through to stripping it.
		const raw = unpadded.toString("utf8");
		if (isLikelyText(raw)) return raw;
		if (unpadded.length >= HOST_HASH_PREFIX_LENGTH) {
			const withoutPrefix = unpadded
				.subarray(HOST_HASH_PREFIX_LENGTH)
				.toString("utf8");
			if (isLikelyText(withoutPrefix)) return withoutPrefix;
		}
		return null;
	} catch {
		return null;
	}
}

/** Rejects strings containing control bytes — a sign we stripped the wrong prefix. */
function isLikelyText(value: string): boolean {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: detecting them is the point.
	return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}

function chromeTimeToUnixSeconds(expiresUtc: number): number | undefined {
	if (!expiresUtc || expiresUtc <= 0) return undefined;
	const unixMs = Math.round(expiresUtc / 1000) - CHROME_EPOCH_OFFSET_MS;
	return Math.floor(unixMs / 1000);
}

function sameSiteFor(value: number): ImportedCookie["sameSite"] {
	switch (value) {
		case 0:
			return "no_restriction";
		case 1:
			return "lax";
		case 2:
			return "strict";
		default:
			return "unspecified";
	}
}

/** Builds the URL Electron's `cookies.set` requires from a cookie's host/path. */
function cookieUrl(
	hostKey: string,
	isSecure: boolean,
	cookiePath: string,
): string {
	const host = hostKey.startsWith(".") ? hostKey.slice(1) : hostKey;
	const scheme = isSecure ? "https" : "http";
	return `${scheme}://${host}${cookiePath || "/"}`;
}

/**
 * Maps a raw cookie row to an importable cookie, decrypting its value. Returns
 * null when the value can't be decrypted (e.g. app-bound encryption).
 */
export function mapCookieRow(
	row: ChromeCookieRow,
	key: Buffer,
): ImportedCookie | null {
	const value = row.encrypted_value?.length
		? decryptCookieValue(row.encrypted_value, key)
		: row.value;
	if (value === null || value === undefined) return null;

	const isSecure = row.is_secure === 1;
	const cookie: ImportedCookie = {
		url: cookieUrl(row.host_key, isSecure, row.path),
		name: row.name,
		value,
		path: row.path || "/",
		secure: isSecure,
		httpOnly: row.is_httponly === 1,
		sameSite: sameSiteFor(row.samesite),
	};
	// Chrome marks a domain cookie with a leading dot; a bare host means the
	// cookie was set without `Domain` and is host-only. Passing the bare host as
	// `domain` would make Electron store it as `.host`, and the next time the
	// site sets its own host-only cookie of that name the browser would send
	// both — Google answers that with `accounts.google.com/CookieMismatch`.
	if (row.host_key.startsWith(".")) cookie.domain = row.host_key;
	if (row.is_persistent === 1) {
		const expiration = chromeTimeToUnixSeconds(row.expires_utc);
		if (expiration !== undefined) cookie.expirationDate = expiration;
	}
	return cookie;
}

/**
 * Reads and decrypts cookies from a Chromium profile. Chrome locks the live
 * `Cookies` DB while running, so we read a copy. Returns an empty array when the
 * DB or the Keychain key is unavailable.
 */
export async function readCookiesFromProfile(
	profileDir: string,
	browserKey: string,
): Promise<ImportedCookie[]> {
	const source = path.join(profileDir, "Cookies");
	if (!existsSync(source)) return [];

	const safeStorageKey = await readSafeStorageKey(browserKey);
	if (!safeStorageKey) return [];
	const key = deriveCookieKey(safeStorageKey);

	const tempDir = mkdtempSync(
		path.join(os.tmpdir(), "superset-cookie-import-"),
	);
	const tempDb = path.join(tempDir, "Cookies");
	try {
		copyFileSync(source, tempDb);
		for (const suffix of ["-wal", "-shm"]) {
			const sidecar = `${source}${suffix}`;
			if (existsSync(sidecar)) copyFileSync(sidecar, `${tempDb}${suffix}`);
		}
		const db = new Database(tempDb, { readonly: true, fileMustExist: true });
		try {
			const rows = db
				.prepare(
					`SELECT host_key, name, value, encrypted_value, path, expires_utc,
					        is_secure, is_httponly, samesite, is_persistent
					 FROM cookies`,
				)
				.all() as ChromeCookieRow[];
			const cookies: ImportedCookie[] = [];
			for (const row of rows) {
				const cookie = mapCookieRow(row, key);
				if (cookie) cookies.push(cookie);
			}
			return cookies;
		} finally {
			db.close();
		}
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export interface CookieImportResult {
	imported: number;
	skipped: number;
	/** True when no cookies could be read — usually the Keychain key was denied. */
	keyUnavailable: boolean;
}

/**
 * Hosts we never import cookies for: importing Superset's own session cookies
 * from the system browser could clobber the app's signed-in session.
 */
function isProtectedCookieHost(host: string): boolean {
	const bare = (host.startsWith(".") ? host.slice(1) : host)
		.toLowerCase()
		.replace(/^\[|\]$/g, ""); // strip IPv6 brackets, e.g. [::1]
	return (
		bare === "localhost" ||
		bare.endsWith(".localhost") ||
		bare === "127.0.0.1" ||
		bare === "::1" ||
		bare === "superset.sh" ||
		bare.endsWith(".superset.sh")
	);
}

function cookieHost(cookie: ImportedCookie): string {
	return cookie.domain ?? new URL(cookie.url).hostname;
}

/** Identity of a cookie slot: the exact host key plus name and path. */
function cookieKey(hostKey: string, name: string, cookiePath: string): string {
	return `${hostKey}|${name}|${cookiePath}`;
}

function slotOf(cookie: Electron.Cookie): string {
	return cookieKey(cookie.domain ?? "", cookie.name, cookie.path ?? "/");
}

/** RFC 6265 section 5.1.3: whether a cookie's domain covers a request host. */
function domainCovers(cookieDomain: string | undefined, host: string): boolean {
	if (!cookieDomain) return false;
	if (!cookieDomain.startsWith(".")) return cookieDomain === host;
	const bare = cookieDomain.slice(1);
	return host === bare || host.endsWith(`.${bare}`);
}

/** RFC 6265 section 5.1.4: whether a cookie's path covers a request path. */
function pathCovers(cookiePath: string, requestPath: string): boolean {
	if (cookiePath === requestPath) return true;
	if (!requestPath.startsWith(cookiePath)) return false;
	return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}

/**
 * `cookies.remove(url, name)` is the only deletion Electron offers, and it
 * takes every cookie of that name the URL would receive: the `.host` twin, the
 * host-only cookie, and any parent-domain or shorter-path cookie too. The URL
 * has to be https (which also matches non-Secure cookies) and carry the path.
 */
function removalUrl(host: string, cookiePath: string): string {
	return `https://${host}${cookiePath || "/"}`;
}

function cookiesRemovedBy(
	jar: Electron.Cookie[],
	host: string,
	cookiePath: string,
	name: string,
): Electron.Cookie[] {
	return jar.filter(
		(cookie) =>
			cookie.name === name &&
			domainCovers(cookie.domain, host) &&
			pathCovers(cookie.path ?? "/", cookiePath),
	);
}

/** The `cookies.set` call that recreates a cookie exactly as the jar holds it. */
function toSetDetails(cookie: Electron.Cookie): Electron.CookiesSetDetails {
	const domain = cookie.domain ?? "";
	const cookiePath = cookie.path ?? "/";
	return {
		url: removalUrl(domain.replace(/^\./, ""), cookiePath),
		name: cookie.name,
		value: cookie.value,
		path: cookiePath,
		secure: cookie.secure,
		httpOnly: cookie.httpOnly,
		sameSite: cookie.sameSite,
		...(domain.startsWith(".") && { domain }),
		...(cookie.expirationDate !== undefined && {
			expirationDate: cookie.expirationDate,
		}),
	};
}

/**
 * Deletes the `.host` twins named in `doomed` (slot keys, see `cookieKey`),
 * one host-only slot at a time, and puts back every other cookie the removal
 * took with it. `jar` is the snapshot the collateral is restored from, so it
 * must predate the removals. If a restore fails the remaining cookies of that
 * slot, twin included, are put back rather than left missing.
 */
async function dropDottedTwins(
	targetSession: Session,
	jar: Electron.Cookie[],
	slots: Array<{ host: string; name: string; path: string }>,
): Promise<number> {
	const doomed = new Set(
		slots.map((slot) => cookieKey(`.${slot.host}`, slot.name, slot.path)),
	);
	let dropped = 0;
	for (const slot of slots) {
		const hit = cookiesRemovedBy(jar, slot.host, slot.path, slot.name);
		const keep = hit.filter((cookie) => !doomed.has(slotOf(cookie)));
		try {
			await targetSession.cookies.remove(
				removalUrl(slot.host, slot.path),
				slot.name,
			);
		} catch {
			continue;
		}
		try {
			for (const cookie of keep) {
				await targetSession.cookies.set(toSetDetails(cookie));
			}
			dropped++;
		} catch {
			for (const cookie of hit) {
				await targetSession.cookies.set(toSetDetails(cookie)).catch(() => {});
			}
		}
	}
	return dropped;
}

/**
 * Bare hosts that already hold a `.host` domain cookie with the same name and
 * path. A session's jar can hold both, and the browser sends both values,
 * which sites reject or read inconsistently. Earlier versions of this
 * importer created that state for every host-only cookie in the source
 * profile, so a re-import has to clean it up rather than assume it absent.
 */
function dottedTwinSlots(cookies: Electron.Cookie[]): Set<string> {
	const slots = new Set<string>();
	for (const cookie of cookies) {
		if (!cookie.domain?.startsWith(".")) continue;
		slots.add(
			cookieKey(cookie.domain.slice(1), cookie.name, cookie.path ?? "/"),
		);
	}
	return slots;
}

/**
 * Injects already-decrypted cookies into an Electron session (a browser pane's
 * jar). Skips cookies for Superset's own hosts and any the session rejects.
 *
 * A host-only cookie replaces a stale `.host` twin left by an earlier import,
 * unless the source profile itself holds both — then both are imported as-is.
 * Twins go first, before any cookie is written, so a value the removal
 * restores from the old jar is overwritten by the source's value afterwards.
 */
export async function importCookies(
	targetSession: Session,
	cookies: ImportedCookie[],
): Promise<Omit<CookieImportResult, "keyUnavailable">> {
	const accepted = cookies.filter(
		(cookie) => !isProtectedCookieHost(cookieHost(cookie)),
	);
	const sourceDomainSlots = new Set(
		accepted
			.filter((cookie) => cookie.domain !== undefined)
			.map((cookie) =>
				cookieKey((cookie.domain as string).slice(1), cookie.name, cookie.path),
			),
	);
	const jar = await targetSession.cookies.get({});
	const staleTwins = dottedTwinSlots(jar);
	const twinsToDrop = accepted
		.filter((cookie) => cookie.domain === undefined)
		.map((cookie) => ({
			host: cookieHost(cookie),
			name: cookie.name,
			path: cookie.path,
		}))
		.filter((slot) => {
			const key = cookieKey(slot.host, slot.name, slot.path);
			return staleTwins.has(key) && !sourceDomainSlots.has(key);
		});
	await dropDottedTwins(targetSession, jar, twinsToDrop);

	let imported = 0;
	let skipped = cookies.length - accepted.length;
	for (const cookie of accepted) {
		try {
			await targetSession.cookies.set(cookie);
			imported++;
		} catch {
			// Chrome stores some cookies Electron rejects (invalid host/secure
			// combinations, etc.). Skip rather than fail.
			skipped++;
		}
	}
	return { imported, skipped };
}

/**
 * Reads a Chromium profile's cookies and injects them into an Electron session
 * (a browser pane's jar), so the user's logins carry over.
 */
export async function importCookiesIntoSession(
	targetSession: Session,
	profileDir: string,
	browserKey: string,
): Promise<CookieImportResult> {
	const cookies = await readCookiesFromProfile(profileDir, browserKey);
	if (cookies.length === 0) {
		return { imported: 0, skipped: 0, keyUnavailable: true };
	}
	const result = await importCookies(targetSession, cookies);
	return { ...result, keyUnavailable: false };
}
