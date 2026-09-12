import { afterAll, describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { Terminal as XtermTerminal } from "@xterm/xterm";

// Exercise the installed bundles, so dropping the version-pinned dependency
// patch fails behaviorally. DOM measurement is stubbed; actual glyph clipping
// is covered by the D2Coding CDP reproduction linked in patches/README.md.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const canvases = [globalThis.HTMLCanvasElement, globalThis.OffscreenCanvas]
	.filter(Boolean)
	.map((canvas) => ({
		prototype: canvas.prototype,
		descriptor: Object.getOwnPropertyDescriptor(canvas.prototype, "getContext"),
	}));
for (const { prototype } of canvases) {
	Object.defineProperty(prototype, "getContext", {
		configurable: true,
		value: () => ({ font: "", measureText: () => ({ width: 7 }) }),
	});
}
afterAll(async () => {
	for (const { prototype, descriptor } of canvases) {
		if (descriptor) Object.defineProperty(prototype, "getContext", descriptor);
		else delete (prototype as { getContext?: unknown }).getContext;
	}
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Core = {
	_renderService: {
		dimensions: { css: { cell: { width: number; height: number } } };
	};
	_bufferService: { buffer: { x: number } };
};
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
const libDir = dirname(require.resolve("@xterm/xterm"));

for (const bundle of ["xterm.js", "xterm.mjs"]) {
	const { Terminal } = (await import(join(libDir, bundle))) as {
		Terminal: typeof XtermTerminal;
	};
	describe(`xterm IME cell layout (${bundle})`, () => {
		async function withTerminal(
			run: (context: {
				terminal: XtermTerminal;
				core: Core;
				view: HTMLElement;
				textarea: HTMLTextAreaElement;
				compose: (text: string) => void;
			}) => void | Promise<void>,
		) {
			const host = document.createElement("div");
			document.body.appendChild(host);
			const terminal = new Terminal({ cols: 10, rows: 3 });
			try {
				terminal.open(host);
				const core = (terminal as unknown as { _core: Core })._core;
				Object.assign(core._renderService.dimensions.css.cell, {
					width: 8,
					height: 16,
				});
				const textarea = terminal.textarea;
				const view = host.querySelector<HTMLElement>(".composition-view");
				if (!textarea || !view)
					throw new Error("Terminal input elements missing");
				const compose = (text: string) => {
					const event = new Event("compositionupdate");
					Object.defineProperty(event, "data", { value: text });
					textarea.dispatchEvent(event);
				};
				textarea.dispatchEvent(new CompositionEvent("compositionstart"));
				await run({ terminal, core, view, textarea, compose });
				textarea.dispatchEvent(new CompositionEvent("compositionend"));
				await tick();
			} finally {
				terminal.textarea?.dispatchEvent(new Event("compositionend"));
				await tick();
				terminal.dispose();
				host.remove();
			}
		}

		test("CJK glyphs get two renderer cells despite a seven-pixel font advance", async () => {
			await withTerminal(({ view, compose }) => {
				compose("글한글");
				const run = view.firstElementChild as HTMLElement;
				expect(run.style.direction).toBe("ltr");
				expect(run.style.unicodeBidi).toBe("isolate");
				expect(
					[...run.children].map((cell) => [
						cell.textContent,
						(cell as HTMLElement).style.width,
					]),
				).toEqual([
					["글", "16px"],
					["한", "16px"],
					["글", "16px"],
				]);
			});
		});

		test("combining accents stay on their base and supplementary CJK stays intact", async () => {
			await withTerminal(({ view, compose }) => {
				compose("e\u0301𠀀");
				expect(
					[...(view.firstElementChild?.children ?? [])].map((cell) => [
						cell.textContent,
						(cell as HTMLElement).style.width,
					]),
				).toEqual([
					["e\u0301", "8px"],
					["𠀀", "16px"],
				]);
			});
		});

		test("long preedit keeps its order and follows its end at the right edge", async () => {
			await withTerminal(({ view, core, compose }) => {
				core._bufferService.buffer.x = 9;
				compose("글한글".repeat(20));
				expect(view.textContent).toBe("글한글".repeat(20));
				expect(view.style.maxWidth).toBe("8px");
				expect(view.style.overflow).toBe("hidden");
				expect(view.style.direction).toBe("rtl");
				expect((view.firstElementChild as HTMLElement).style.unicodeBidi).toBe(
					"isolate",
				);
			});
		});

		test("a changed cell width is used by the next composition update", async () => {
			await withTerminal(({ view, core, compose }) => {
				compose("글");
				core._renderService.dimensions.css.cell.width = 9;
				compose("글");
				expect(
					(view.firstElementChild?.firstElementChild as HTMLElement).style
						.width,
				).toBe("18px");
			});
		});

		test("starting another composition clears the previous preedit", async () => {
			await withTerminal(({ view, textarea, compose }) => {
				compose("글");
				textarea.dispatchEvent(new CompositionEvent("compositionstart"));
				expect(view.textContent).toBe("");
				compose("é");
				expect(view.textContent).toBe("é");
			});
		});

		test("commits the composed text exactly once", async () => {
			await withTerminal(async ({ terminal, textarea, compose }) => {
				const data: string[] = [];
				terminal.onData((chunk) => data.push(chunk));
				compose("글");
				textarea.value = "글";
				textarea.setSelectionRange(1, 1);
				await tick();
				textarea.dispatchEvent(new CompositionEvent("compositionend"));
				await tick();
				expect(data).toEqual(["글"]);
			});
		});
	});
}
