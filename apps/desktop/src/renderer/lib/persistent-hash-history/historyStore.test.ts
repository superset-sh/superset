import { describe, expect, it } from "bun:test";
import { LEGACY_WINDOW_KEY } from "shared/window-identity";
import { capEntries, parseHandoff, readLegacyHistory } from "./historyStore";

function encode(value: unknown): string {
	return encodeURIComponent(JSON.stringify(value));
}

/** Storage double; `readLegacyHistory` only needs getItem/removeItem. */
function makeStorage(initial: Record<string, string> = {}) {
	const map = new Map(Object.entries(initial));
	return {
		map,
		getItem: (key: string) => map.get(key) ?? null,
		removeItem: (key: string) => {
			map.delete(key);
		},
	};
}

describe("parseHandoff", () => {
	it("reads the record handed over on the command line", () => {
		const encoded = encode({ entries: ["/", "/a"], index: 1 });
		expect(parseHandoff(encoded)).toEqual({ entries: ["/", "/a"], index: 1 });
	});

	it("returns null for an absent or empty argument", () => {
		expect(parseHandoff(undefined)).toBeNull();
		expect(parseHandoff("")).toBeNull();
	});

	it("returns null rather than throwing on a malformed payload", () => {
		expect(parseHandoff("not-json")).toBeNull();
		expect(parseHandoff(encode({ entries: "nope", index: 0 }))).toBeNull();
		expect(parseHandoff(encode({ entries: [], index: 0 }))).toBeNull();
		expect(parseHandoff(encode({ entries: ["/"], index: "x" }))).toBeNull();
		// `entries[0.5]` is undefined — the router would start on no route.
		expect(
			parseHandoff(encode({ entries: ["/", "/a"], index: 0.5 })),
		).toBeNull();
	});

	it("clamps an index that points past the end", () => {
		// The main process trims from the front to fit the argv budget, so a
		// stored index can outrun the entries that survive.
		expect(parseHandoff(encode({ entries: ["/", "/a"], index: 9 }))).toEqual({
			entries: ["/", "/a"],
			index: 1,
		});
		expect(parseHandoff(encode({ entries: ["/"], index: -3 }))).toEqual({
			entries: ["/"],
			index: 0,
		});
	});
});

describe("readLegacyHistory", () => {
	const record = JSON.stringify({ entries: ["/", "/old"], index: 1 });

	it("migrates this window's own per-window record, and removes it", () => {
		const storage = makeStorage({ "router-history:window-a": record });

		expect(readLegacyHistory("window-a", storage)).toEqual({
			entries: ["/", "/old"],
			index: 1,
		});
		expect(storage.map.has("router-history:window-a")).toBe(false);
	});

	it("lets the legacy window claim the pre-multi-window record", () => {
		const storage = makeStorage({ "router-history": record });

		expect(readLegacyHistory(LEGACY_WINDOW_KEY, storage)).toEqual({
			entries: ["/", "/old"],
			index: 1,
		});
		expect(storage.map.has("router-history")).toBe(false);
	});

	it("never lets an ordinary window claim the pre-multi-window record", () => {
		const storage = makeStorage({ "router-history": record });

		expect(readLegacyHistory("window-b", storage)).toBeNull();
		// Left for the legacy window, which may not have opened yet.
		expect(storage.map.get("router-history")).toBe(record);
	});

	it("prefers the legacy window's own record over the shared one", () => {
		const own = JSON.stringify({ entries: ["/", "/mine"], index: 1 });
		const storage = makeStorage({
			"router-history": record,
			[`router-history:${LEGACY_WINDOW_KEY}`]: own,
		});

		expect(readLegacyHistory(LEGACY_WINDOW_KEY, storage)).toEqual({
			entries: ["/", "/mine"],
			index: 1,
		});
	});

	it("returns null when there is nothing to migrate", () => {
		expect(readLegacyHistory("window-a", makeStorage())).toBeNull();
	});

	it("drops a corrupt record instead of failing the boot", () => {
		const storage = makeStorage({ "router-history:window-a": "{{{" });
		expect(readLegacyHistory("window-a", storage)).toBeNull();
		expect(storage.map.has("router-history:window-a")).toBe(false);
	});

	it("survives storage that throws", () => {
		const throwing = {
			getItem: () => {
				throw new Error("denied");
			},
			removeItem: () => {},
		};
		expect(readLegacyHistory("window-a", throwing)).toBeNull();
	});
});

describe("capEntries", () => {
	it("leaves a short history alone", () => {
		expect(capEntries(["/", "/a"], 1)).toEqual({
			entries: ["/", "/a"],
			index: 1,
		});
	});

	it("keeps the newest entries and moves the index with them", () => {
		const entries = Array.from({ length: 130 }, (_, i) => `/r${i}`);

		const capped = capEntries(entries, 129);

		expect(capped.entries).toHaveLength(100);
		expect(capped.entries[0]).toBe("/r30");
		expect(capped.entries[capped.index]).toBe("/r129");
	});

	it("clamps the index to zero when the current entry is dropped", () => {
		const entries = Array.from({ length: 130 }, (_, i) => `/r${i}`);
		expect(capEntries(entries, 2).index).toBe(0);
	});
});
