// Asserts host-service source has no Electron coupling. The migration's
// thesis is that host-service is independently deployable; this test
// keeps that promise honest by failing if someone accidentally imports
// electron, uses an Electron global, or shells out to an Electron API.
//
// Why a grep test rather than a real `node dist/host-service.js` smoke
// test: native addons (better-sqlite3, node-pty, @parcel/watcher) are
// marked external in the bundle and currently expect Electron's
// resolution path. Solving the native-addon distribution for headless
// deploy is its own slice. In the meantime this test catches the
// regression class the smoke test was designed to catch: "did we
// re-couple to Electron at the source level?"

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_DIR = path.resolve(import.meta.dirname);

const ELECTRON_PATTERNS = [
	// Imports
	/from\s+["']electron["']/,
	/from\s+["']@electron[/-]/,
	/from\s+["']electron\/(main|renderer)["']/,
	/require\(["']electron["']\)/,
	// Runtime detection / globals
	/process\.versions\.electron/,
	/\bapp\.(getPath|getName|getVersion|isPackaged)\b/,
	/\bdialog\.(showMessageBox|showSaveDialog|showOpenDialog)\b/,
	/\bBrowserWindow\b/,
	/\bipcMain\b/,
	/\bipcRenderer\b/,
];

function* walk(dir: string): Generator<string> {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") continue;
			yield* walk(full);
			continue;
		}
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
		// Skip self.
		if (full === import.meta.url.replace(/^file:\/\//, "")) continue;
		yield full;
	}
}

describe("host-service has no Electron coupling", () => {
	test("no Electron imports or globals in src/", () => {
		const offenders: { file: string; line: number; match: string }[] = [];
		for (const file of walk(SRC_DIR)) {
			const contents = fs.readFileSync(file, "utf-8");
			const lines = contents.split("\n");
			lines.forEach((line, idx) => {
				// Skip our own assertions.
				if (line.includes("ELECTRON_PATTERNS")) return;
				for (const pat of ELECTRON_PATTERNS) {
					if (pat.test(line)) {
						offenders.push({
							file: path.relative(SRC_DIR, file),
							line: idx + 1,
							match: line.trim(),
						});
					}
				}
			});
		}
		if (offenders.length > 0) {
			throw new Error(
				`Found Electron coupling in host-service source:\n${offenders
					.map((o) => `  ${o.file}:${o.line}  ${o.match}`)
					.join("\n")}`,
			);
		}
		expect(offenders.length).toBe(0);
	});
});
