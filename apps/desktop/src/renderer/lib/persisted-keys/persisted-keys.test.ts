import { describe, expect, spyOn, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readdirSync, readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join, relative } from "node:path";
import { PERSISTED_KEY_REGISTRY } from "./persisted-key-registry.test-data";
import { DEAD_KEYS, sweepDeadPersistedKeys } from "./persisted-keys";

function makeStorage(entries: Record<string, string>): Storage {
	const map = new Map(Object.entries(entries));
	return {
		get length() {
			return map.size;
		},
		key: (index: number) => [...map.keys()][index] ?? null,
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
		removeItem: (key: string) => void map.delete(key),
		clear: () => map.clear(),
	};
}

describe("sweepDeadPersistedKeys", () => {
	test("removes exact and prefix dead keys, keeps everything else", () => {
		const storage = makeStorage({
			"pending-workspaces-org-a": "{}",
			"pending-workspaces-org-b": "{}",
			"v1-migration-last-run-at-org-a": "1",
			"notification-center-store": "{}",
			"v2-workspace-local-state-org-a": "{}",
			"changes-store": "{}",
			ph_project_posthog: "{}",
			outlit_session: "{}",
		});

		const removed = sweepDeadPersistedKeys(storage);

		expect(removed).toBe(5);
		expect(storage.getItem("pending-workspaces-org-a")).toBeNull();
		expect(storage.getItem("pending-workspaces-org-b")).toBeNull();
		expect(storage.getItem("v1-migration-last-run-at-org-a")).toBeNull();
		expect(storage.getItem("notification-center-store")).toBeNull();
		expect(storage.getItem("v2-workspace-local-state-org-a")).toBe("{}");
		expect(storage.getItem("changes-store")).toBe("{}");
		expect(storage.getItem("ph_project_posthog")).toBe("{}");
		expect(storage.getItem("outlit_session")).toBeNull();
	});

	test("an exact dead key does not match keys it merely prefixes", () => {
		const storage = makeStorage({ "notification-center-store-v2": "{}" });
		expect(sweepDeadPersistedKeys(storage)).toBe(0);
		expect(storage.getItem("notification-center-store-v2")).toBe("{}");
	});

	test("reports storage failures without breaking renderer boot", () => {
		const error = new DOMException("storage disabled", "SecurityError");
		const storage = {
			get length(): number {
				throw error;
			},
		} as Storage;
		const warn = spyOn(console, "warn").mockImplementation(() => {});

		try {
			expect(sweepDeadPersistedKeys(storage)).toBe(0);
			expect(warn).toHaveBeenCalledWith(
				"[persisted-keys] Dead-key sweep failed",
				error,
			);
		} finally {
			warn.mockRestore();
		}
	});

	test("no dead key shadows a registered live key", () => {
		const liveKeys = PERSISTED_KEY_REGISTRY.flatMap((owner) => owner.keys);
		for (const dead of DEAD_KEYS) {
			for (const live of liveKeys) {
				const literal = live.replaceAll("*", "");
				const collides =
					dead.match === "exact"
						? literal === dead.key
						: literal.startsWith(dead.key);
				expect(collides).toBe(false);
			}
		}
	});
});

// --- registry enforcement -------------------------------------------------

const RENDERER_DIR = join(import.meta.dir, "..", "..");

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return walk(path);
		return /\.(ts|tsx)$/.test(entry.name) &&
			!/\.(test|stories)\.(ts|tsx)$/.test(entry.name)
			? [path]
			: [];
	});
}

/** Remove comments without treating comment markers inside strings as syntax. */
function stripComments(source: string): string {
	let result = "";
	let quote: '"' | "'" | "`" | undefined;
	let escaped = false;

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		const next = source[index + 1];

		if (quote) {
			result += char;
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === quote) quote = undefined;
			continue;
		}

		if (char === '"' || char === "'" || char === "`") {
			quote = char;
			result += char;
			continue;
		}

		if (char === "/" && next === "/") {
			index += 2;
			while (index < source.length && source[index] !== "\n") index += 1;
			result += source[index] ?? "";
			continue;
		}

		if (char === "/" && next === "*") {
			index += 2;
			while (
				index < source.length &&
				!(source[index] === "*" && source[index + 1] === "/")
			) {
				if (source[index] === "\n") result += "\n";
				index += 1;
			}
			index += 1;
			continue;
		}

		result += char;
	}

	return result;
}

function isPersistedKeyWriter(source: string): boolean {
	const code = stripComments(source);
	if (/localStorageCollectionOptions\s*\(/.test(code)) return true;
	if (
		code.includes("zustand/middleware") &&
		/\bpersist\s*(?:<|\()/.test(code)
	) {
		return true;
	}
	if (
		/\b(?:window\s*\.\s*|globalThis\s*\.\s*)?localStorage\s*\.\s*setItem\s*\(/.test(
			code,
		)
	) {
		return true;
	}
	// A few persistence wrappers accept or derive a Storage receiver before
	// calling setItem. Requiring both the localStorage source and a known
	// storage-shaped receiver keeps those visible without flagging arbitrary
	// caches that happen to expose setItem().
	return (
		/\blocalStorage\b/.test(code) &&
		/\b(?:storage|base)\s*\.\s*setItem\s*\(|\bgetStorage\s*\(\s*\)\s*\?\.\s*setItem\s*\(/.test(
			code,
		)
	);
}

describe("isPersistedKeyWriter", () => {
	test("ignores sessionStorage writes", () => {
		expect(isPersistedKeyWriter('sessionStorage.setItem("key", "value")')).toBe(
			false,
		);
	});

	test("detects localStorage writes in files that also use sessionStorage", () => {
		expect(
			isPersistedKeyWriter(`
				sessionStorage.setItem("temporary", "value");
				localStorage.setItem("persistent", "value");
			`),
		).toBe(true);
	});

	test("ignores setItem calls on non-storage objects", () => {
		expect(isPersistedKeyWriter('cache.setItem("key", "value")')).toBe(false);
	});

	test("ignores localStorage hints in trailing comments", () => {
		expect(
			isPersistedKeyWriter(
				'const value = "temporary"; // localStorage.setItem("key", value)',
			),
		).toBe(false);
	});

	test("does not mistake URLs in strings for comments", () => {
		expect(
			isPersistedKeyWriter(
				'const url = "https://example.com"; localStorage.setItem("key", url)',
			),
		).toBe(true);
	});

	test("detects typed zustand persist calls", () => {
		expect(
			isPersistedKeyWriter(`
				import { persist } from "zustand/middleware";
				persist<State>(() => ({ value: true }));
			`),
		).toBe(true);
	});
});

describe("persisted-key registry", () => {
	test("every localStorage writer is registered, and no entry is stale", () => {
		const writers = walk(RENDERER_DIR)
			.filter((path) => isPersistedKeyWriter(readFileSync(path, "utf8")))
			.map(
				(path) =>
					`src/renderer/${relative(RENDERER_DIR, path).replaceAll("\\", "/")}`,
			)
			.sort();
		const registered = PERSISTED_KEY_REGISTRY.map((owner) => owner.file).sort();

		const unregistered = writers.filter((file) => !registered.includes(file));
		const stale = registered.filter((file) => !writers.includes(file));

		// New writer: add a PERSISTED_KEY_REGISTRY entry declaring what bounds
		// the key and what deletes it (policy in apps/desktop/AGENTS.md).
		expect(unregistered).toEqual([]);
		// Removed writer: move its keys to DEAD_KEYS so existing profiles get
		// swept, then drop the registry entry.
		expect(stale).toEqual([]);
	});
});
