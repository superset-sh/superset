import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { markLeaderboardAsked, readLeaderboardAsked } from "./askedState";

const originalLocalStorage = Object.getOwnPropertyDescriptor(
	globalThis,
	"localStorage",
);

function installStorage(): void {
	const entries = new Map<string, string>();
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		writable: true,
		value: {
			getItem: (key: string) => entries.get(key) ?? null,
			setItem: (key: string, value: string) => {
				entries.set(key, value);
			},
			removeItem: (key: string) => {
				entries.delete(key);
			},
			clear: () => entries.clear(),
			key: (index: number) => [...entries.keys()][index] ?? null,
			get length() {
				return entries.size;
			},
		} satisfies Storage,
	});
}

beforeEach(installStorage);

afterAll(() => {
	if (originalLocalStorage) {
		Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
	} else {
		Reflect.deleteProperty(globalThis, "localStorage");
	}
});

describe("leaderboard asked flag", () => {
	it("reports not asked on a fresh profile", () => {
		expect(readLeaderboardAsked()).toBe(false);
	});

	it("round-trips through markLeaderboardAsked", () => {
		markLeaderboardAsked();
		expect(readLeaderboardAsked()).toBe(true);
	});

	it("treats an unrecognised value as not asked", () => {
		localStorage.setItem("leaderboard-asked-v1", "{}");
		expect(readLeaderboardAsked()).toBe(false);
	});

	it("suppresses the prompt when storage is unavailable", () => {
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			get() {
				throw new Error("denied");
			},
		});
		expect(readLeaderboardAsked()).toBe(true);
	});
});
