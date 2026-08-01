import { describe, expect, it } from "bun:test";
import type { LinkTierMap } from "../types";
import {
	resolveChangesSidebarFileIntent,
	tierForChangesSidebarFileIntent,
} from "./changesSidebarFilePolicy";

const map: LinkTierMap = {
	plain: "pane",
	shift: "newTab",
	meta: "pane",
	metaShift: "external",
};

describe("changes sidebar file policy", () => {
	it("keeps plain click on the diff", () => {
		expect(
			resolveChangesSidebarFileIntent(map, {
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
			}),
		).toBe("diff");
	});

	it("maps shift-click through the settings map", () => {
		expect(
			resolveChangesSidebarFileIntent(map, {
				metaKey: false,
				ctrlKey: false,
				shiftKey: true,
			}),
		).toBe("diffNewTab");
	});

	it("maps cmd/ctrl-click to the file when the settings action is pane", () => {
		expect(
			resolveChangesSidebarFileIntent(map, {
				metaKey: true,
				ctrlKey: false,
				shiftKey: false,
			}),
		).toBe("file");
		expect(
			resolveChangesSidebarFileIntent(map, {
				metaKey: false,
				ctrlKey: true,
				shiftKey: false,
			}),
		).toBe("file");
	});

	it("maps cmd/ctrl-shift-click to the external editor", () => {
		expect(
			resolveChangesSidebarFileIntent(map, {
				metaKey: true,
				ctrlKey: false,
				shiftKey: true,
			}),
		).toBe("external");
		expect(
			resolveChangesSidebarFileIntent(map, {
				metaKey: false,
				ctrlKey: true,
				shiftKey: true,
			}),
		).toBe("external");
	});

	it("returns null for unbound tiers", () => {
		expect(
			resolveChangesSidebarFileIntent(
				{ ...map, meta: null },
				{
					metaKey: true,
					ctrlKey: false,
					shiftKey: false,
				},
			),
		).toBeNull();
	});

	it("finds shortcuts for menu items from the same map", () => {
		expect(tierForChangesSidebarFileIntent(map, "diffNewTab")).toBe("shift");
		expect(tierForChangesSidebarFileIntent(map, "file")).toBe("meta");
		expect(tierForChangesSidebarFileIntent(map, "external")).toBe("metaShift");
	});
});
