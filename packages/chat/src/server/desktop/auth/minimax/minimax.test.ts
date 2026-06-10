import { beforeEach, describe, expect, it, mock } from "bun:test";

interface FakeAuthStorage {
	reload: ReturnType<typeof mock<() => void>>;
	get: ReturnType<typeof mock<(providerId: string) => unknown>>;
}

function makeFakeAuthStorage(): FakeAuthStorage {
	return {
		reload: mock(() => {}),
		get: mock((_providerId: string) => undefined),
	};
}

const fakeAuthStorage = makeFakeAuthStorage();

mock.module("mastracode", () => ({
	createAuthStorage: mock(() => fakeAuthStorage),
	createMastraCode: mock(async () => ({
		harness: {},
		mcpManager: null,
		hookManager: null,
		authStorage: null,
		storageWarning: undefined,
	})),
}));

const { getMiniMaxCredentialsFromAuthStorage } = await import("./minimax");

describe("getMiniMaxCredentialsFromAuthStorage", () => {
	beforeEach(() => {
		fakeAuthStorage.reload.mockClear();
		fakeAuthStorage.get.mockClear();
		fakeAuthStorage.get.mockReturnValue(undefined);
	});

	it("returns null when storage is empty", () => {
		expect(getMiniMaxCredentialsFromAuthStorage()).toBeNull();
	});

	it("returns null when the minimax entry is missing", () => {
		fakeAuthStorage.get.mockImplementation((providerId: string) =>
			providerId === "anthropic"
				? { type: "api_key", key: "sk-ant-..." }
				: undefined,
		);
		expect(getMiniMaxCredentialsFromAuthStorage()).toBeNull();
	});

	it("returns the api key when stored", () => {
		fakeAuthStorage.get.mockImplementation((providerId: string) =>
			providerId === "minimax"
				? { type: "api_key", key: "sk-cp-..." }
				: undefined,
		);

		const result = getMiniMaxCredentialsFromAuthStorage();
		expect(result).not.toBeNull();
		expect(result?.apiKey).toBe("sk-cp-...");
		expect(result?.providerId).toBe("minimax");
		expect(result?.kind).toBe("apiKey");
		expect(result?.source).toBe("auth-storage");
	});

	it("trims whitespace from the api key", () => {
		fakeAuthStorage.get.mockImplementation((providerId: string) =>
			providerId === "minimax"
				? { type: "api_key", key: "  sk-cp-...  \n" }
				: undefined,
		);
		expect(getMiniMaxCredentialsFromAuthStorage()?.apiKey).toBe("sk-cp-...");
	});

	it("returns null when key is empty after trim", () => {
		fakeAuthStorage.get.mockImplementation((providerId: string) =>
			providerId === "minimax" ? { type: "api_key", key: "   " } : undefined,
		);
		expect(getMiniMaxCredentialsFromAuthStorage()).toBeNull();
	});

	it("returns null when entry has wrong type (not api_key)", () => {
		fakeAuthStorage.get.mockImplementation((providerId: string) =>
			providerId === "minimax"
				? { type: "oauth", access: "something", key: "ignored" }
				: undefined,
		);
		expect(getMiniMaxCredentialsFromAuthStorage()).toBeNull();
	});

	it("returns null when entry is not a plain object", () => {
		fakeAuthStorage.get.mockImplementation((providerId: string) =>
			providerId === "minimax" ? "not-an-object" : undefined,
		);
		expect(getMiniMaxCredentialsFromAuthStorage()).toBeNull();
	});

	it("swallows storage read errors and returns null", () => {
		fakeAuthStorage.reload.mockImplementation(() => {
			throw new Error("disk on fire");
		});
		const origWarn = console.warn;
		console.warn = () => {};
		try {
			expect(getMiniMaxCredentialsFromAuthStorage()).toBeNull();
		} finally {
			console.warn = origWarn;
		}
	});
});
