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

const { confirmClosePorts } = await import("./confirmClosePorts");

describe("confirmClosePorts", () => {
	beforeEach(() => {
		suppressed = false;
		suppress.mockClear();
	});

	it("confirms a single port with running-process copy", async () => {
		let options: AlertOptions | undefined;
		const showAlert = mock((nextOptions: AlertOptions) => {
			options = nextOptions;
			return true;
		});

		const confirmation = confirmClosePorts(1, showAlert);

		expect(options?.title).toBe("This port is still in use");
		expect(options?.description).toBe(
			"Closing this port will end the process using it.",
		);
		expect(options?.actions[0]?.label).toBe("Close port");

		await options?.actions[0]?.onClick?.({ checkboxChecked: false });
		expect(await confirmation).toBe(true);
	});

	it("uses plural copy and resolves false when canceled", async () => {
		let options: AlertOptions | undefined;
		const showAlert = (nextOptions: AlertOptions) => {
			options = nextOptions;
			return true;
		};

		const confirmation = confirmClosePorts(2, showAlert);

		expect(options?.title).toBe("These ports are still in use");
		expect(options?.description).toBe(
			"Closing these ports will end the processes using them.",
		);
		expect(options?.actions[0]?.label).toBe("Close ports");

		await options?.actions[1]?.onClick?.({ checkboxChecked: false });
		expect(await confirmation).toBe(false);
	});

	it("resolves false when the dialog is dismissed", async () => {
		let options: AlertOptions | undefined;
		const confirmation = confirmClosePorts(1, (nextOptions) => {
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
		const confirmation = confirmClosePorts(1, showAlert);

		await options?.actions[0]?.onClick?.({
			checkboxChecked: true,
		});
		expect(await confirmation).toBe(true);
		expect(suppressed).toBe(true);
		expect(suppress).toHaveBeenCalledTimes(1);

		expect(await confirmClosePorts(1, showAlert)).toBe(true);
		expect(showAlert).toHaveBeenCalledTimes(1);
	});

	it("fails open when the alert layer is unavailable", async () => {
		expect(await confirmClosePorts(1, () => false)).toBe(true);
	});
});
