import { describe, expect, it } from "bun:test";
import {
	getOpenTargetClickIntent,
	getSidebarClickIntent,
	type ModifierClickEvent,
} from "./getSidebarClickIntent";

function event(init: Partial<ModifierClickEvent> = {}): ModifierClickEvent {
	return {
		ctrlKey: init.ctrlKey ?? false,
		metaKey: init.metaKey ?? false,
		shiftKey: init.shiftKey ?? false,
	};
}

describe("getOpenTargetClickIntent", () => {
	it("maps plain, shift, and mod clicks to shared open targets", () => {
		expect(getOpenTargetClickIntent(event())).toBe("openInCurrentTab");
		expect(getOpenTargetClickIntent(event({ shiftKey: true }))).toBe(
			"openInNewTab",
		);
		expect(getOpenTargetClickIntent(event({ metaKey: true }))).toBe(
			"openExternally",
		);
		expect(getOpenTargetClickIntent(event({ ctrlKey: true }))).toBe(
			"openExternally",
		);
	});
});

describe("getSidebarClickIntent", () => {
	it("preserves file-sidebar labels over the shared open targets", () => {
		expect(getSidebarClickIntent(event())).toBe("select");
		expect(getSidebarClickIntent(event({ shiftKey: true }))).toBe(
			"openInNewTab",
		);
		expect(getSidebarClickIntent(event({ metaKey: true }))).toBe(
			"openInEditor",
		);
	});
});
