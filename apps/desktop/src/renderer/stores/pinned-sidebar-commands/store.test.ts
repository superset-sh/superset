import { beforeEach, describe, expect, test } from "bun:test";
import {
	MAX_PINNED_SIDEBAR_COMMANDS,
	usePinnedSidebarCommandsStore,
} from "./store";

describe("usePinnedSidebarCommandsStore", () => {
	beforeEach(() => {
		usePinnedSidebarCommandsStore.setState({ commandIds: [] });
	});

	test("togglePinned pins a command, then unpins it", () => {
		const { togglePinned } = usePinnedSidebarCommandsStore.getState();

		togglePinned("usage.open");
		expect(usePinnedSidebarCommandsStore.getState().commandIds).toEqual([
			"usage.open",
		]);

		togglePinned("usage.open");
		expect(usePinnedSidebarCommandsStore.getState().commandIds).toEqual([]);
	});

	test("keeps pins in the order they were added", () => {
		const { togglePinned } = usePinnedSidebarCommandsStore.getState();

		togglePinned("usage.open");
		togglePinned("resources.check");

		expect(usePinnedSidebarCommandsStore.getState().commandIds).toEqual([
			"usage.open",
			"resources.check",
		]);
	});

	test("drops the oldest pin once the cap is exceeded", () => {
		const { togglePinned } = usePinnedSidebarCommandsStore.getState();

		for (let i = 0; i <= MAX_PINNED_SIDEBAR_COMMANDS; i++) {
			togglePinned(`command.${i}`);
		}

		const { commandIds } = usePinnedSidebarCommandsStore.getState();
		expect(commandIds).toHaveLength(MAX_PINNED_SIDEBAR_COMMANDS);
		expect(commandIds).not.toContain("command.0");
		expect(commandIds.at(-1)).toBe(`command.${MAX_PINNED_SIDEBAR_COMMANDS}`);
	});

	test("unpin ignores a command that is not pinned", () => {
		const { togglePinned, unpin } = usePinnedSidebarCommandsStore.getState();
		togglePinned("usage.open");

		unpin("resources.check");

		expect(usePinnedSidebarCommandsStore.getState().commandIds).toEqual([
			"usage.open",
		]);
	});
});
