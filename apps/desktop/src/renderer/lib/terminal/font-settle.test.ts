import { afterEach, describe, expect, test } from "bun:test";
import { waitForFontReady } from "./font-settle";

type FontsStub = {
	load: (spec: string) => Promise<unknown>;
	calls: string[];
};

function stubFonts(load: (spec: string) => Promise<unknown>): {
	stub: FontsStub;
	restore: () => void;
} {
	const calls: string[] = [];
	const stub: FontsStub = {
		load: (spec: string) => {
			calls.push(spec);
			return load(spec);
		},
		calls,
	};
	const doc = document as Document & { fonts?: FontFaceSet };
	const prev = doc.fonts;
	(doc as unknown as { fonts: unknown }).fonts = stub;
	return {
		stub,
		restore: () => {
			(doc as unknown as { fonts: unknown }).fonts = prev;
		},
	};
}

describe("waitForFontReady", () => {
	let restore: (() => void) | null = null;

	afterEach(() => {
		restore?.();
		restore = null;
	});

	test("resolves immediately when document.fonts is unavailable", async () => {
		const doc = document as Document & { fonts?: FontFaceSet };
		const prev = doc.fonts;
		(doc as unknown as { fonts: unknown }).fonts = undefined;
		try {
			const started = Date.now();
			await waitForFontReady({
				fontFamily: '"JetBrains Mono", monospace',
				fontSize: 14,
				timeoutMs: 5000,
			});
			expect(Date.now() - started).toBeLessThan(50);
		} finally {
			(doc as unknown as { fonts: unknown }).fonts = prev;
		}
	});

	test("calls FontFaceSet.load with the configured size and family list", async () => {
		const { stub, restore: r } = stubFonts(() => Promise.resolve([]));
		restore = r;

		await waitForFontReady({
			fontFamily: '"MesloLGS NF", monospace',
			fontSize: 14,
			timeoutMs: 1000,
		});

		expect(stub.calls).toEqual(['14px "MesloLGS NF", monospace']);
	});

	test("waits for the font promise before resolving (covers the open-before-load race)", async () => {
		let resolveLoad: () => void = () => {};
		const loadPromise = new Promise<void>((res) => {
			resolveLoad = res;
		});
		const { restore: r } = stubFonts(() => loadPromise);
		restore = r;

		let resolved = false;
		const ready = waitForFontReady({
			fontFamily: '"MesloLGS NF", monospace',
			fontSize: 14,
			timeoutMs: 5000,
		}).then(() => {
			resolved = true;
		});

		// Give the microtask queue a chance to drain — the promise must still be pending.
		await new Promise((res) => setTimeout(res, 10));
		expect(resolved).toBe(false);

		resolveLoad();
		await ready;
		expect(resolved).toBe(true);
	});

	test("times out instead of blocking forever when the font never loads", async () => {
		const neverResolves = new Promise<void>(() => {});
		const { restore: r } = stubFonts(() => neverResolves);
		restore = r;

		const started = Date.now();
		await waitForFontReady({
			fontFamily: '"NonExistent Font"',
			fontSize: 14,
			timeoutMs: 50,
		});
		const elapsed = Date.now() - started;

		expect(elapsed).toBeGreaterThanOrEqual(40);
		expect(elapsed).toBeLessThan(500);
	});

	test("still resolves when the font load promise rejects", async () => {
		const { restore: r } = stubFonts(() => Promise.reject(new Error("bad")));
		restore = r;

		await waitForFontReady({
			fontFamily: '"BrokenFont"',
			fontSize: 14,
			timeoutMs: 1000,
		});
	});
});
