import { afterEach, beforeEach, expect, jest, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { AccountTerminalDialogFrame } from "./AccountTerminalDialogFrame";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
	cleanup();
	jest.runAllTimers();
	jest.useRealTimers();
});

function fixture(launching = false) {
	const trigger = document.createElement("button");
	trigger.textContent = "Add tab";
	document.body.append(trigger);
	const onClose = mock(() => {});
	const view = render(
		<AccountTerminalDialogFrame
			launching={launching}
			onClose={onClose}
			returnFocus={trigger}
		>
			<input aria-label="Account" />
		</AccountTerminalDialogFrame>,
	);
	return { trigger, onClose, view };
}

test("traps account-picker focus and restores the Add Tab trigger after cancellation", () => {
	const { trigger, onClose, view } = fixture();
	try {
		const dialog = view.getByRole("dialog");
		expect(trigger.getAttribute("aria-hidden")).toBe("true");
		act(() => {
			trigger.focus();
		});
		expect(dialog.contains(document.activeElement)).toBe(true);
		fireEvent.keyDown(dialog, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
		view.unmount();
		act(() => {
			jest.runAllTimers();
		});
		expect(document.activeElement).toBe(trigger);
	} finally {
		trigger.remove();
	}
});

test("keeps a pending launch modal and does not steal focus from its new terminal", () => {
	const { trigger, onClose, view } = fixture(true);
	const terminal = document.createElement("textarea");
	document.body.append(terminal);
	try {
		fireEvent.keyDown(view.getByRole("dialog"), { key: "Escape" });
		expect(onClose).not.toHaveBeenCalled();
		expect(view.queryByRole("button", { name: "Close" })).toBeNull();
		view.unmount();
		terminal.focus();
		act(() => {
			jest.runAllTimers();
		});
		expect(document.activeElement).toBe(terminal);
	} finally {
		trigger.remove();
		terminal.remove();
	}
});
