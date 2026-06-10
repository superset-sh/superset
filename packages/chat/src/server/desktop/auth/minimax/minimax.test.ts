import { describe, expect, it } from "bun:test";
import {
	getMiniMaxCredentialsFromAuthStorage,
	type MiniMaxAuthStorageLike,
} from "./minimax";

function makeStorage(
	entries: Record<string, unknown>,
): MiniMaxAuthStorageLike {
	return {
		reload: () => {},
		get: (providerId: string) => entries[providerId],
	};
}

describe("getMiniMaxCredentialsFromAuthStorage", () => {
	it("returns null when storage is empty", () => {
		expect(getMiniMaxCredentialsFromAuthStorage(makeStorage({}))).toBeNull();
	});

	it("returns null when the minimax entry is missing", () => {
		expect(
			getMiniMaxCredentialsFromAuthStorage(
				makeStorage({ anthropic: { type: "api_key", key: "sk-ant-..." } }),
			),
		).toBeNull();
	});

	it("returns the api key when stored", () => {
		const result = getMiniMaxCredentialsFromAuthStorage(
			makeStorage({ minimax: { type: "api_key", key: "sk-cp-..." } }),
		);
		expect(result).not.toBeNull();
		expect(result?.apiKey).toBe("sk-cp-...");
		expect(result?.providerId).toBe("minimax");
		expect(result?.kind).toBe("apiKey");
		expect(result?.source).toBe("auth-storage");
	});

	it("trims whitespace from the api key", () => {
		const result = getMiniMaxCredentialsFromAuthStorage(
			makeStorage({ minimax: { type: "api_key", key: "  sk-cp-...  \n" } }),
		);
		expect(result?.apiKey).toBe("sk-cp-...");
	});

	it("returns null when key is empty after trim", () => {
		expect(
			getMiniMaxCredentialsFromAuthStorage(
				makeStorage({ minimax: { type: "api_key", key: "   " } }),
			),
		).toBeNull();
	});

	it("returns null when entry has wrong type (not api_key)", () => {
		expect(
			getMiniMaxCredentialsFromAuthStorage(
				makeStorage({
					minimax: { type: "oauth", access: "something", key: "ignored" },
				}),
			),
		).toBeNull();
	});

	it("returns null when entry is not a plain object", () => {
		expect(
			getMiniMaxCredentialsFromAuthStorage(
				makeStorage({ minimax: "not-an-object" }),
			),
		).toBeNull();
	});

	it("swallows storage read errors and returns null", () => {
		const broken: MiniMaxAuthStorageLike = {
			reload: () => {
				throw new Error("disk on fire");
			},
			get: () => null,
		};
		// Suppress the expected console.warn from this test
		const origWarn = console.warn;
		console.warn = () => {};
		try {
			expect(getMiniMaxCredentialsFromAuthStorage(broken)).toBeNull();
		} finally {
			console.warn = origWarn;
		}
	});
});
