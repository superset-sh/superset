import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Guards the DecorationService hunk of the bun patch on @xterm/xterm
// (GH #7630, see patches/README.md). Unpatched, DecorationService only clears
// its per-line index when `this._decorations.delete(decoration)` returns true,
// and that list is keyed by `marker.line` — which Marker.dispose() has already
// set to -1 by the time it fires the event that disposes the decoration. A
// marker-initiated disposal therefore leaves the decoration in the index the
// renderers read per cell, and its background keeps being painted over
// whatever text later occupies those cells, for the life of the terminal.
// Cmd+F reaches this on every keystroke, so a search leaves a trail of grey
// blocks. patchedDependencies is keyed to an exact version, so a bump silently
// drops the patch while everything still builds. If this fails after a bump,
// check whether upstream fixed it (the conditional around `_lineCache.remove`)
// and regenerate the patch per patches/README.md; do NOT delete it.

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

// The DOM renderer measures glyphs through a 2d context happy-dom does not
// implement; widths only need to be finite here.
const context2d = { font: "", measureText: () => ({ width: 8 }) };
const stubbedCanvases: Array<{
	prototype: object;
	descriptor: PropertyDescriptor | undefined;
}> = [];
for (const canvas of [
	globalThis.OffscreenCanvas,
	globalThis.HTMLCanvasElement,
]) {
	if (!canvas) continue;
	stubbedCanvases.push({
		prototype: canvas.prototype,
		descriptor: Object.getOwnPropertyDescriptor(canvas.prototype, "getContext"),
	});
	Object.defineProperty(canvas.prototype, "getContext", {
		configurable: true,
		writable: true,
		value: () => context2d,
	});
}

afterAll(async () => {
	for (const { prototype, descriptor } of stubbedCanvases) {
		if (descriptor) Object.defineProperty(prototype, "getContext", descriptor);
		else delete (prototype as { getContext?: unknown }).getContext;
	}
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const { Terminal } = await import("@xterm/xterm");

interface DecorationService {
	readonly decorations: IterableIterator<unknown>;
	getDecorationsAtCell(
		x: number,
		line: number,
		layer?: "bottom" | "top",
	): IterableIterator<unknown>;
}

function openTerminal() {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const terminal = new Terminal({ cols: 40, rows: 10 });
	terminal.open(host);
	return terminal;
}

/** The index the renderers read; no public API exposes it. */
function decorationService(terminal: InstanceType<typeof Terminal>) {
	return (
		terminal as unknown as { _core: { _decorationService: DecorationService } }
	)._core._decorationService;
}

function countAtCell(service: DecorationService, x: number, line: number) {
	return [...service.getDecorationsAtCell(x, line)].length;
}

describe("@xterm/xterm DecorationService disposal patch", () => {
	const libDir = dirname(require.resolve("@xterm/xterm"));
	for (const name of ["xterm.js", "xterm.mjs"] as const) {
		test(`${name} carries the patch`, () => {
			const src = readFileSync(join(libDir, name), "utf8");
			expect(src).toContain("marker.isDisposed?");
			expect(src).toContain("_indexedStartLine:");
			expect(src).toMatch(/isDisposed\|\|\((?:\w+)=(?:\w+)\.options\.x\?\?0/);
		});
	}

	// The decorations have to sit on different lines, as a query matching on
	// several lines does: with a single key in the list, the lookup for the -1
	// key lands on the disposed decoration itself and the delete happens to
	// succeed, hiding the bug.
	async function decorateLines(terminal: InstanceType<typeof Terminal>) {
		await new Promise<void>((resolve) => {
			terminal.write("one\r\ntwo\r\nthree\r\nfour\r\nfive\r\n", () =>
				resolve(),
			);
		});
		return [0, 1, 2, 3, 4].map((offset) => {
			const marker = terminal.registerMarker(-offset);
			if (!marker) throw new Error(`no marker at offset -${offset}`);
			const decoration = terminal.registerDecoration({
				marker,
				x: 1,
				width: 3,
				backgroundColor: "#515c6a",
			});
			if (!decoration) throw new Error(`no decoration at offset -${offset}`);
			return { marker, decoration, line: marker.line };
		});
	}

	test("nothing stays indexed after the match decorations are disposed", async () => {
		const terminal = openTerminal();
		const decorated = await decorateLines(terminal);
		const service = decorationService(terminal);
		for (const { line } of decorated) {
			expect(countAtCell(service, 2, line)).toBe(1);
		}

		// What a re-search (every keystroke in the find bar) does with the
		// previous generation of matches.
		for (const { marker } of decorated) marker.dispose();

		for (const { line } of decorated) {
			expect(countAtCell(service, 2, line)).toBe(0);
		}
		expect([...service.decorations]).toHaveLength(0);

		terminal.dispose();
	});

	test("a surviving match is untouched when its neighbours are disposed", async () => {
		const terminal = openTerminal();
		const decorated = await decorateLines(terminal);
		const service = decorationService(terminal);
		const kept = decorated[0];

		for (const { marker } of decorated.slice(1)) marker.dispose();

		expect(countAtCell(service, 2, kept.line)).toBe(1);
		expect([...service.decorations]).toHaveLength(1);

		terminal.dispose();
	});
});
