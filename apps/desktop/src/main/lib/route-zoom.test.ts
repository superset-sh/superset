import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { keepZoomAcrossRoutes } from "./route-zoom";

type Contents = Parameters<typeof keepZoomAcrossRoutes>[0];

function fakeContents(zoomByUrl: Map<string, number>, url: string) {
	const emitter = new EventEmitter();
	const contents = {
		url,
		on: (event: string, listener: (...args: unknown[]) => void) =>
			emitter.on(event, listener),
		getZoomLevel: () => zoomByUrl.get(contents.url) ?? 0,
		setZoomLevel: (level: number) => {
			zoomByUrl.set(contents.url, level);
		},
		isDestroyed: () => false,
		navigate(next: string, { isSameDocument = true, isMainFrame = true } = {}) {
			emitter.emit("did-start-navigation", { isSameDocument, isMainFrame });
			contents.url = next;
			if (isSameDocument)
				emitter.emit("did-navigate-in-page", {}, next, isMainFrame);
		},
	};
	return contents;
}

describe("keepZoomAcrossRoutes", () => {
	test("keeps the window zoom on a route that has no zoom of its own", () => {
		const window = fakeContents(new Map([["#/", 2]]), "#/");
		keepZoomAcrossRoutes(window as unknown as Contents, {
			listGuests: () => [],
			onDocumentLeave: () => {},
		});

		window.navigate("#/v2-workspace/a");

		expect(window.getZoomLevel()).toBe(2);
	});

	test("keeps a browser pane's zoom when the route change reaches it", () => {
		const window = fakeContents(new Map([["#/", 2]]), "#/");
		const guestZoom = new Map([["https://example.com", -1]]);
		const guest = fakeContents(guestZoom, "https://example.com");
		const setWindowZoom = window.setZoomLevel;
		window.setZoomLevel = (level: number) => {
			setWindowZoom(level);
			guest.setZoomLevel(level);
		};
		keepZoomAcrossRoutes(window as unknown as Contents, {
			listGuests: () => [guest as unknown as Contents],
			onDocumentLeave: () => {},
		});

		window.navigate("#/v2-workspace/a");

		expect(window.getZoomLevel()).toBe(2);
		expect(guest.getZoomLevel()).toBe(-1);
	});

	test("reports the zoom when the document is replaced, and ignores subframes", () => {
		const window = fakeContents(new Map([["#/", 1.5]]), "#/");
		const reported: number[] = [];
		keepZoomAcrossRoutes(window as unknown as Contents, {
			listGuests: () => [],
			onDocumentLeave: (level) => reported.push(level),
		});

		window.navigate("#/", { isSameDocument: false, isMainFrame: false });
		window.navigate("#/", { isSameDocument: false });

		expect(reported).toEqual([1.5]);
	});
});
