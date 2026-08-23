import { describe, expect, it } from "bun:test";
import { createCipheriv, createHash } from "node:crypto";
import {
	decryptCookieValue,
	deriveCookieKey,
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
