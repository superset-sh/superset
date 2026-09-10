import { describe, expect, it } from "bun:test";
import {
	MAX_ROUTER_HISTORY_ARGV_BYTES,
	ROUTER_HISTORY_ARG,
} from "shared/window-identity";
import { buildRouterHistoryArg } from "./routerHistoryArg";

function decode(arg: string) {
	return JSON.parse(decodeURIComponent(arg.slice(ROUTER_HISTORY_ARG.length)));
}

describe("buildRouterHistoryArg", () => {
	it("returns null when there is nothing to restore", () => {
		expect(buildRouterHistoryArg(undefined)).toBeNull();
		expect(buildRouterHistoryArg({ entries: [], index: 0 })).toBeNull();
	});

	it("round-trips a small history", () => {
		const arg = buildRouterHistoryArg({ entries: ["/", "/a"], index: 1 });

		expect(arg?.startsWith(ROUTER_HISTORY_ARG)).toBe(true);
		expect(decode(arg as string)).toEqual({ entries: ["/", "/a"], index: 1 });
	});

	it("encodes so a path with argv-hostile characters survives", () => {
		const entries = ["/", "/search?q=a b&c=1", "/x#frag", '/quote"path'];

		const arg = buildRouterHistoryArg({ entries, index: 3 });

		expect(arg).not.toContain(" ");
		expect(decode(arg as string).entries).toEqual(entries);
	});

	it("trims from the front until the payload fits the argv budget", () => {
		// Long paths blow the budget well before the entry cap does.
		const entries = Array.from(
			{ length: 100 },
			(_, i) => `/${"p".repeat(200)}/${i}`,
		);

		const arg = buildRouterHistoryArg({ entries, index: 99 });
		const decoded = decode(arg as string);

		expect(
			Buffer.byteLength(JSON.stringify(decoded), "utf8"),
		).toBeLessThanOrEqual(MAX_ROUTER_HISTORY_ARGV_BYTES);
		expect(decoded.entries.length).toBeLessThan(entries.length);
		// The entry the window is actually on is the last thing given up.
		expect(decoded.entries[decoded.index]).toBe(entries[99]);
	});

	it("keeps the active entry when the window sits at the oldest one", () => {
		// Regression: trimming the front unconditionally dropped the entry the
		// window was actually on whenever index was 0, so it restored onto a
		// forward entry instead of its own route.
		const entries = Array.from(
			{ length: 100 },
			(_, i) => `/${"p".repeat(200)}/${i}`,
		);

		const decoded = decode(
			buildRouterHistoryArg({ entries, index: 0 }) as string,
		);

		expect(decoded.entries[decoded.index]).toBe(entries[0]);
		expect(
			Buffer.byteLength(JSON.stringify(decoded), "utf8"),
		).toBeLessThanOrEqual(MAX_ROUTER_HISTORY_ARGV_BYTES);
	});

	it("keeps the active entry from the middle of an oversized history", () => {
		const entries = Array.from(
			{ length: 100 },
			(_, i) => `/${"p".repeat(200)}/${i}`,
		);

		const decoded = decode(
			buildRouterHistoryArg({ entries, index: 50 }) as string,
		);

		expect(decoded.entries[decoded.index]).toBe(entries[50]);
	});

	it("clamps an out-of-range stored index", () => {
		expect(
			decode(buildRouterHistoryArg({ entries: ["/"], index: 7 }) as string),
		).toEqual({ entries: ["/"], index: 0 });
	});

	it("gives up rather than emitting an oversized argument", () => {
		// A single entry that cannot fit under any trimming.
		const entries = [`/${"x".repeat(MAX_ROUTER_HISTORY_ARGV_BYTES * 2)}`];
		expect(buildRouterHistoryArg({ entries, index: 0 })).toBeNull();
	});
});
