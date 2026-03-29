import { describe, expect, test } from "bun:test";

import {
	alertDialogPrimaryActionSelector,
	focusEnterEnabledAlertDialogPrimaryAction,
} from "./focus-enter-enabled-alert-dialog-primary-action";

describe("focusEnterEnabledAlertDialogPrimaryAction", () => {
	test("focuses the alert dialog action and prevents default autofocus", () => {
		let prevented = false;
		let focused = false;
		let queriedSelector: string | null = null;

		focusEnterEnabledAlertDialogPrimaryAction({
			currentTarget: {
				querySelector: (selector: string) => {
					queriedSelector = selector;
					return {
						focus: () => {
							focused = true;
						},
					};
				},
			},
			defaultPrevented: false,
			preventDefault: () => {
				prevented = true;
			},
		});

		expect(String(queriedSelector)).toBe(alertDialogPrimaryActionSelector);
		expect(prevented).toBe(true);
		expect(focused).toBe(true);
	});

	test("does nothing when no primary action is marked", () => {
		let prevented = false;

		focusEnterEnabledAlertDialogPrimaryAction({
			currentTarget: {
				querySelector: () => null,
			},
			defaultPrevented: false,
			preventDefault: () => {
				prevented = true;
			},
		});

		expect(prevented).toBe(false);
	});

	test("respects an already prevented autofocus event", () => {
		let queried = false;
		let prevented = false;

		focusEnterEnabledAlertDialogPrimaryAction({
			currentTarget: {
				querySelector: () => {
					queried = true;
					return null;
				},
			},
			defaultPrevented: true,
			preventDefault: () => {
				prevented = true;
			},
		});

		expect(queried).toBe(false);
		expect(prevented).toBe(false);
	});
});
