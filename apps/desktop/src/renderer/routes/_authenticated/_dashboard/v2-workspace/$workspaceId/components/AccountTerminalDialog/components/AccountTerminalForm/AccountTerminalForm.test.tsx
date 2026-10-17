import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { AccountTerminalForm } from "./AccountTerminalForm";

afterEach(cleanup);

test("resume keeps the provider fixed and requires explicit account selection", async () => {
	const input = props();
	const view = render(<AccountTerminalForm {...input} mode="resume" />);
	expect((view.getByRole("combobox") as HTMLButtonElement).disabled).toBe(true);
	const submit = view.getByRole("button", {
		name: "Resume conversation",
	}) as HTMLButtonElement;
	expect(submit.disabled).toBe(true);
	fireEvent.click(view.getByRole("radio"));
	await act(async () => {
		fireEvent.click(submit);
	});
	expect(input.onLaunch).toHaveBeenCalledWith({
		selection: null,
		identity: "alice",
	});
	expect(input.onConfigChange).not.toHaveBeenCalled();
});

test("resume rejection retains the selection and never retries automatically", async () => {
	const input = props();
	input.onLaunch = mock(async () => {
		throw new Error("Saved history is unavailable to this account");
	});
	const view = render(<AccountTerminalForm {...input} mode="resume" />);
	fireEvent.click(view.getByRole("radio"));
	await act(async () => {
		fireEvent.click(view.getByRole("button", { name: "Resume conversation" }));
	});
	expect(view.getByRole("alert").textContent).toBe(
		"Saved history is unavailable to this account",
	);
	expect((view.getByRole("radio") as HTMLInputElement).checked).toBe(true);
	expect(input.onLaunch).toHaveBeenCalledTimes(1);
	expect(input.onCancel).not.toHaveBeenCalled();
});

function props(): ComponentProps<typeof AccountTerminalForm> {
	return {
		configs: [{ id: "claude-config", label: "Claude" }],
		configId: "claude-config",
		onConfigChange: mock(() => {}),
		accounts: [
			{
				selection: null,
				identity: "alice",
				email: "alice@example.test",
				label: "System login",
			},
		],
		loading: false,
		refreshing: false,
		error: null,
		launching: false,
		onRefresh: mock(async () => {}),
		onCancel: mock(() => {}),
		onLaunch: mock(async () => {}),
	};
}

test("requires an explicit account and preserves the selected system login", async () => {
	const input = props();
	const view = render(<AccountTerminalForm {...input} />);
	const submit = view.getByRole("button", {
		name: "Start terminal",
	}) as HTMLButtonElement;
	expect(submit.disabled).toBe(true);
	fireEvent.click(view.getByRole("radio"));
	await act(async () => {
		fireEvent.click(submit);
	});
	expect(input.onLaunch).toHaveBeenCalledWith({
		selection: null,
		identity: "alice",
	});
});

test("invalidates a selection when the profile signs into another identity", () => {
	const input = props();
	const view = render(<AccountTerminalForm {...input} />);
	fireEvent.click(view.getByRole("radio"));
	view.rerender(
		<AccountTerminalForm
			{...input}
			accounts={[
				{
					selection: null,
					identity: "bob",
					email: "bob@example.test",
					label: "System login",
				},
			]}
		/>,
	);
	expect(
		(view.getByRole("button", { name: "Start terminal" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
	expect(view.getByRole("alert").textContent).toContain(
		"selected login changed",
	);
	fireEvent.submit(view.container.querySelector("form") as HTMLFormElement);
	expect(input.onLaunch).not.toHaveBeenCalled();
});

test("a discovery failure blocks a previously selected account", () => {
	const input = props();
	const view = render(<AccountTerminalForm {...input} />);
	fireEvent.click(view.getByRole("radio"));
	view.rerender(<AccountTerminalForm {...input} error="Update this host" />);
	fireEvent.submit(view.container.querySelector("form") as HTMLFormElement);
	expect(view.getByRole("alert").textContent).toBe("Update this host");
	expect(input.onLaunch).not.toHaveBeenCalled();
});

test("shows rejected launches in place without retrying a default account", async () => {
	const input = props();
	input.onLaunch = mock(async () => {
		throw new Error("The selected account changed");
	});
	const view = render(<AccountTerminalForm {...input} />);
	fireEvent.click(view.getByRole("radio"));
	await act(async () => {
		fireEvent.submit(view.container.querySelector("form") as HTMLFormElement);
	});
	expect(view.getByRole("alert").textContent).toBe(
		"The selected account changed",
	);
	expect(input.onLaunch).toHaveBeenCalledTimes(1);
	expect(input.onCancel).not.toHaveBeenCalled();
});

test("deduplicates submission before the launching prop updates", async () => {
	const input = props();
	let finish!: () => void;
	input.onLaunch = mock(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const view = render(<AccountTerminalForm {...input} />);
	fireEvent.click(view.getByRole("radio"));
	const form = view.container.querySelector("form") as HTMLFormElement;
	fireEvent.submit(form);
	fireEvent.submit(form);
	expect(input.onLaunch).toHaveBeenCalledTimes(1);
	await act(async () => {
		finish();
	});
});

test("refresh clears the chosen account until the user selects it again", async () => {
	const input = props();
	const view = render(<AccountTerminalForm {...input} />);
	fireEvent.click(view.getByRole("radio"));
	await act(async () => {
		fireEvent.click(view.getByRole("button", { name: "Refresh" }));
	});
	expect(input.onRefresh).toHaveBeenCalledTimes(1);
	expect(
		(view.getByRole("button", { name: "Start terminal" }) as HTMLButtonElement)
			.disabled,
	).toBe(true);
});
