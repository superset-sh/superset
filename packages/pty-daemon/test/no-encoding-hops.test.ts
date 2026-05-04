// Source-level invariant: the data path in pty-daemon and host-service's
// DaemonClient must NOT contain encoding hops.
//
// Pre-protocol-v2, PTY input/output bytes were base64'd into a JSON `data`
// field. After v2, bytes ride in the frame's binary tail and there are
// zero encode/decode passes per chunk. This test fails the moment anyone
// reintroduces a hop in source — much earlier than runtime tests catch it.
//
// Why source-level (not bundle-level): bundlers minify/rename identifiers,
// so grepping the bundle is fragile. The source files we want to guard are
// short, stable, and centrally located.

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

/**
 * Read a file relative to the repo root with comments stripped. We only
 * care about real code: comments are allowed to *mention* forbidden patterns
 * (e.g. "the old `chunk.toString("utf8")` was the bug"), they just can't
 * actually call them.
 */
function read(relPath: string): string {
	const abs = path.resolve(repoRoot, relPath);
	if (!fs.existsSync(abs)) {
		throw new Error(`expected file not found: ${relPath}`);
	}
	const raw = fs.readFileSync(abs, "utf8");
	return stripComments(raw);
}

function stripComments(src: string): string {
	// Block comments first (so `// inside /* */` doesn't escape the strip),
	// then line comments. Naive — doesn't try to parse strings — but more
	// than enough for our well-formatted source files.
	return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// Files in the daemon ↔ host wire data path. If any of these grow a base64
// or per-chunk-utf8 hop, the canary fires.
const DATA_PATH_FILES = [
	"packages/pty-daemon/src/Server/Server.ts",
	"packages/pty-daemon/src/handlers/handlers.ts",
	"packages/pty-daemon/src/protocol/messages.ts",
	"packages/pty-daemon/src/protocol/framing.ts",
	"packages/host-service/src/terminal/DaemonClient/DaemonClient.ts",
];

describe("data path is base64-free", () => {
	test.each(DATA_PATH_FILES)('%s: no toString("base64")', (rel) => {
		const src = read(rel);
		expect(src).not.toContain('toString("base64")');
		expect(src).not.toContain("toString('base64')");
	});

	test.each(DATA_PATH_FILES)('%s: no Buffer.from(.., "base64")', (rel) => {
		const src = read(rel);
		// Catches the input-decode shape `Buffer.from(msg.data, "base64")`
		// and any sibling `Buffer.from(<x>, "base64")` in the data path.
		expect(src).not.toMatch(/Buffer\.from\([^)]*,\s*["']base64["']/);
	});

	test('OutputMessage and InputMessage do not declare a "data" field', () => {
		// If anyone re-adds `data: string` to either message, base64 is
		// the only way to fit binary into JSON — drop the temptation early.
		const src = read("packages/pty-daemon/src/protocol/messages.ts");
		const outputBlock = extractInterfaceBlock(src, "OutputMessage");
		const inputBlock = extractInterfaceBlock(src, "InputMessage");
		expect(outputBlock).not.toMatch(/^\s*data\s*:/m);
		expect(inputBlock).not.toMatch(/^\s*data\s*:/m);
	});
});

describe("output relay is StringDecoder-safe (host-service)", () => {
	test('terminal.ts only uses Buffer.toString("utf8") in side-channel paths', () => {
		// Per-chunk `chunk.toString("utf8")` was the renderer-side bug.
		// terminal.ts is allowed to decode for side channels (port hint,
		// teardown tail buffer), but those uses go through `StringDecoder`,
		// not raw `.toString("utf8")`. If a fresh `.toString("utf8")` shows
		// up here, it almost certainly mangles bytes at chunk boundaries.
		const src = read("packages/host-service/src/terminal/terminal.ts");
		// Allow only StringDecoder-mediated decoding; flag plain
		// `chunk.toString("utf8")` / `data.toString("utf8")` shapes.
		expect(src).not.toMatch(/chunk\.toString\(["']utf-?8["']\)/);
		expect(src).not.toMatch(/data\.toString\(["']utf-?8["']\)/);
		expect(src).toContain('new StringDecoder("utf8")');
	});
});

/**
 * Pull out the body of `interface Foo { ... }` so we can assert on its fields
 * without false positives from neighboring interfaces in the same file.
 */
function extractInterfaceBlock(src: string, name: string): string {
	const re = new RegExp(`interface\\s+${name}\\s*{([\\s\\S]*?)}`, "m");
	const match = re.exec(src);
	if (!match) throw new Error(`interface ${name} not found`);
	return match[1] ?? "";
}
