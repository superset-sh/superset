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
	domain: string;
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
	if (
		encryptedValue.length < 3 ||
		encryptedValue.subarray(0, 3).toString() !== "v10"
	) {
		return null;
	}
	try {
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
		domain: row.host_key,
		path: row.path || "/",
		secure: isSecure,
		httpOnly: row.is_httponly === 1,
		sameSite: sameSiteFor(row.samesite),
	};
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

/**
 * Reads a Chromium profile's cookies and injects them into an Electron session
 * (a browser pane's jar), so the user's logins carry over. Skips cookies for
 * Superset's own hosts and any the session rejects.
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

	let imported = 0;
	let skipped = 0;
	for (const cookie of cookies) {
		if (isProtectedCookieHost(cookie.domain)) {
			skipped++;
			continue;
		}
		try {
			await targetSession.cookies.set(cookie);
			imported++;
		} catch {
			// Chrome stores some cookies Electron rejects (invalid host/secure
			// combinations, __Host- prefixes, etc.). Skip rather than fail.
			skipped++;
		}
	}
	return { imported, skipped, keyUnavailable: false };
}
