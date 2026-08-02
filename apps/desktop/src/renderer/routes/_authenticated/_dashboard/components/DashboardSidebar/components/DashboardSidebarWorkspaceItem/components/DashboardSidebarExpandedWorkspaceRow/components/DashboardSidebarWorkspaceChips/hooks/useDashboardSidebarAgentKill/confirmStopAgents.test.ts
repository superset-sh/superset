import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { AlertOptions } from "@superset/ui/atoms/Alert";

let suppressed = false;
const suppress = mock(() => {
	suppressed = true;
});

mock.module("renderer/stores/terminal-close-confirm/store", () => ({
	useTerminalCloseConfirmStore: {
		getState: () => ({ suppressed, suppress }),
	},
}));

const { confirmStopAgents } = await import("./confirmStopAgents");

describe("confirmStopAgents", () => {
	beforeEach(() => {
		suppressed = false;
		suppress.mockClear();
	});

	it("confirms stopping one agent with clear terminal-session copy", async () => {
		let options: AlertOptions | undefined;
		const showAlert = mock((nextOptions: AlertOptions) => {
			options = nextOptions;
			return true;
		});

		const confirmation = confirmStopAgents(1, showAlert);

		expect(options?.title).toBe("This agent is still running");
		expect(options?.description).toBe(
			"Stopping this agent will end its terminal session and interrupt any work in progress.",
		);
		expect(options?.actions[0]?.label).toBe("Stop agent");

		await options?.actions[0]?.onClick?.({ checkboxChecked: false });
		expect(await confirmation).toBe(true);
	});

	it("uses plural copy and resolves false when canceled", async () => {
		let options: AlertOptions | undefined;
		const confirmation = confirmStopAgents(2, (nextOptions) => {
			options = nextOptions;
			return true;
		});

		expect(options?.title).toBe("These agents are still running");
		expect(options?.description).toBe(
			"Stopping these agents will end their terminal sessions and interrupt any work in progress.",
		);
		expect(options?.actions[0]?.label).toBe("Stop agents");

		await options?.actions[1]?.onClick?.({ checkboxChecked: false });
		expect(await confirmation).toBe(false);
	});

	it("resolves false when the dialog is dismissed", async () => {
		let options: AlertOptions | undefined;
		const confirmation = confirmStopAgents(1, (nextOptions) => {
			options = nextOptions;
			return true;
		});

		options?.onDismiss?.();

		expect(await confirmation).toBe(false);
	});

	it("persists the shared running-process suppression preference", async () => {
		let options: AlertOptions | undefined;
		const showAlert = mock((nextOptions: AlertOptions) => {
			options = nextOptions;
			return true;
		});
		const confirmation = confirmStopAgents(1, showAlert);

		await options?.actions[0]?.onClick?.({ checkboxChecked: true });
		expect(await confirmation).toBe(true);
		expect(suppressed).toBe(true);
		expect(suppress).toHaveBeenCalledTimes(1);

		expect(await confirmStopAgents(1, showAlert)).toBe(true);
		expect(showAlert).toHaveBeenCalledTimes(1);
	});

	it("allows an empty selection without opening the dialog", async () => {
		const showAlert = mock((_options: AlertOptions) => true);

		expect(await confirmStopAgents(0, showAlert)).toBe(true);
		expect(showAlert).not.toHaveBeenCalled();
	});

	it("fails open when the alert layer is unavailable", async () => {
		expect(await confirmStopAgents(1, () => false)).toBe(true);
	});
});
