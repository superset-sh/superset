import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	clearPaneScrollStateCache,
	createPaneScrollStateKey,
	flushPaneScrollStateCache,
	getPaneScrollState,
	savePaneScrollState,
} from "./paneScrollStateCache";

beforeEach(clearPaneScrollStateCache);
afterEach(clearPaneScrollStateCache);

describe("paneScrollStateCache", () => {
	test("saves scroll positions and persists them to localStorage", () => {
		savePaneScrollState("editor", { scrollTop: 480, scrollLeft: 32 });

		expect(getPaneScrollState("editor")).toMatchObject({
			scrollTop: 480,
			scrollLeft: 32,
		});
		flushPaneScrollStateCache();
		expect(localStorage.getItem("v2-pane-scroll-state-v1")).toContain(
			'"editor"',
		);
	});

	test("evicts the oldest saved entry", () => {
		for (let index = 0; index <= 250; index += 1) {
			savePaneScrollState(String(index), {
				scrollTop: index,
				scrollLeft: 0,
			});
		}

		expect(getPaneScrollState("0")).toBeUndefined();
		expect(getPaneScrollState("250")?.scrollTop).toBe(250);
	});

	test("scopes keys by workspace, resource, and optional pane", () => {
		const base = {
			workspaceId: "workspace-a",
			viewId: "editor" as const,
			resourceId: "/repo/file.ts",
		};

		expect(createPaneScrollStateKey(base)).not.toBe(
			createPaneScrollStateKey({ ...base, workspaceId: "workspace-b" }),
		);
		expect(createPaneScrollStateKey(base)).not.toBe(
			createPaneScrollStateKey({ ...base, resourceId: "/repo/other.ts" }),
		);
		expect(createPaneScrollStateKey({ ...base, paneId: "pane-a" })).not.toBe(
			createPaneScrollStateKey({ ...base, paneId: "pane-b" }),
		);
	});
});
