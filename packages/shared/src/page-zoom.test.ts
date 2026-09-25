import { describe, expect, test } from "bun:test";
import { createContext, runInContext, Script } from "node:vm";
import { PAGE_COMMENTS_RUNTIME_SOURCE } from "./page-comments-runtime";
import {
	applyPageViewportZoom,
	NEXT_PAGE_VIEWPORT_ZOOM_SCRIPT,
	PAGE_PINCH_ZOOM_RUNTIME_SOURCE,
	type PageViewportZoom,
} from "./page-zoom";

function setup() {
	const listeners = new Map<string, (event: unknown) => void>();
	const style = { zoom: "", width: "", transform: "" };
	let viewport: PageViewportZoom | null = null;
	const context = createContext({
		document: { documentElement: { style } },
		innerWidth: 800,
		innerHeight: 600,
		scrollX: 0,
		scrollY: 100,
		locked: false,
		onZoom: (value: PageViewportZoom) => {
			viewport = value;
		},
		addEventListener: (type: string, listener: (event: unknown) => void) =>
			listeners.set(type, listener),
		scrollBy: ({ left, top }: { left: number; top: number }) => {
			context.scrollX += left;
			context.scrollY += top;
		},
	});
	runInContext(
		`const pinchZoom = (${PAGE_PINCH_ZOOM_RUNTIME_SOURCE})(onZoom, () => locked)`,
		context,
	);
	return {
		context,
		style,
		enable: () => runInContext("pinchZoom.enable()", context),
		viewport: () => viewport,
		wheel: (deltaY: number, overrides = {}) => {
			let prevented = false;
			listeners.get("wheel")?.({
				ctrlKey: true,
				deltaMode: 0,
				deltaX: 0,
				deltaY,
				clientX: 200,
				clientY: 150,
				preventDefault: () => {
					prevented = true;
				},
				...overrides,
			});
			return prevented;
		},
	};
}

describe("page viewport zoom", () => {
	test("composes into valid frame and browser scripts", () => {
		expect(() => new Script(PAGE_COMMENTS_RUNTIME_SOURCE)).not.toThrow();
		expect(() => new Script(NEXT_PAGE_VIEWPORT_ZOOM_SCRIPT)).not.toThrow();
	});
	test("preserves ordinary scrolling and requires host opt-in", () => {
		const page = setup();
		expect(page.wheel(-50)).toBe(false);
		page.enable();
		expect(page.wheel(-50, { ctrlKey: false })).toBe(false);
		expect(page.wheel(-50, { defaultPrevented: true })).toBe(false);
		page.context.locked = true;
		expect(page.wheel(-50)).toBe(false);
	});
	test("magnifies around the pointer without changing content styles or layout scroll", () => {
		const page = setup();
		page.enable();
		page.wheel(-Math.log(2) / 0.01);
		expect(page.viewport()).toEqual({
			scale: 2,
			x: 200,
			y: 150,
			width: 800,
			height: 600,
		});
		expect(page.style).toEqual({ zoom: "", width: "", transform: "" });
		expect(page.context.scrollX).toBe(0);
		expect(page.context.scrollY).toBe(100);
	});
	test("pans within the magnified viewport before scrolling the document", () => {
		const page = setup();
		page.enable();
		page.wheel(-Math.log(2) / 0.01);
		page.wheel(100, { ctrlKey: false, deltaX: 50 });
		expect(page.viewport()?.x).toBe(250);
		expect(page.viewport()?.y).toBe(250);
		expect(page.context.scrollY).toBe(100);
		page.wheel(400, { ctrlKey: false });
		expect(page.viewport()?.y).toBe(600);
		expect(page.context.scrollY).toBe(125);
	});
	test("clamps repeated zooms and returns to an untransformed surface", () => {
		const page = setup();
		page.enable();
		for (let i = 0; i < 20; i++) page.wheel(-100);
		expect(page.viewport()?.scale).toBe(5);
		for (let i = 0; i < 20; i++) page.wheel(100);
		expect(page.viewport()).toEqual({
			scale: 1,
			x: 0,
			y: 0,
			width: 800,
			height: 600,
		});
	});
	test("clips the compositor surface to its original pane without changing its dimensions", () => {
		const style = {
			width: "800px",
			height: "600px",
			transform: "",
			transformOrigin: "",
			clipPath: "",
		};
		const surface = { style };
		applyPageViewportZoom(surface, {
			scale: 2,
			x: 200,
			y: 150,
			width: 800,
			height: 600,
		});
		expect(style).toEqual({
			width: "800px",
			height: "600px",
			transform: "translate(-200px, -150px) scale(2)",
			transformOrigin: "0 0",
			clipPath: "inset(75px 300px 225px 100px)",
		});
		applyPageViewportZoom(surface, {
			scale: 1,
			x: 0,
			y: 0,
			width: 800,
			height: 600,
		});
		expect(style.transform).toBe("");
		expect(style.clipPath).toBe("");
	});
});
