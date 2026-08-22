import { describe, expect, it } from "bun:test";
import { isEventBusReopen } from "./useHostWorkspaces.utils";

describe("isEventBusReopen", () => {
	it("treats any open after the first as a reopen", () => {
		expect(isEventBusReopen(true, "open")).toBe(true);
	});

	it("does not treat the first open as a reopen", () => {
		expect(isEventBusReopen(false, "open")).toBe(false);
	});

	it("ignores transitions that do not land on open", () => {
		expect(isEventBusReopen(true, "reconnecting")).toBe(false);
		expect(isEventBusReopen(true, "closed")).toBe(false);
		expect(isEventBusReopen(true, "connecting")).toBe(false);
	});
});
