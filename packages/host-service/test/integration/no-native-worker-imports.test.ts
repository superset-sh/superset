// The worker graph must stay free of native addons and process-singleton
// state: handlers run both in the worker thread AND inline (fallback), and
// the worker bundle is built without native externals. This grep test guards
// direct imports in src/workers/**; the bundle build catches transitive
// regressions (a native import fails the host-worker.js build).

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const WORKERS_DIR = path.resolve(import.meta.dirname, "../../src/workers");

const FORBIDDEN = [
	/from\s+["']better-sqlite3["']/,
	/from\s+["']node-pty["']/,
	/from\s+["']@parcel\/watcher["']/,
	/from\s+["']electron["']/,
	// host-service process singletons — workers get inputs via payload only
	/from\s+["'][./]*\.\.\/db(\/|["'])/,
	/from\s+["'][./]*\.\.\/events(\/|["'])/,
	/from\s+["'][./]*\.\.\/daemon(\/|["'])/,
];

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (entry.name.endsWith(".ts")) out.push(full);
	}
	return out;
}

describe("worker graph purity", () => {
	test("src/workers/** has no native/singleton imports", () => {
		const offenders: string[] = [];
		for (const file of walk(WORKERS_DIR)) {
			const content = fs.readFileSync(file, "utf8");
			for (const pattern of FORBIDDEN) {
				if (pattern.test(content)) {
					offenders.push(`${path.relative(WORKERS_DIR, file)}: ${pattern}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
