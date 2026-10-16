import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { AccountTerminalForm } from "./AccountTerminalForm";

afterEach(cleanup);

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

test("native chat mode submits the selected login once and keeps failure visible", async () => {
	const input = props();
	input.onLaunch = mock(async () => {
		throw new Error("Account chat unavailable on this host");
	});
	const view = render(<AccountTerminalForm {...input} mode="chat" />);
	const submit = view.getByRole("button", {
		name: "Start chat",
	}) as HTMLButtonElement;
	expect(submit.disabled).toBe(true);
	fireEvent.click(view.getByRole("radio"));
	await act(async () => {
		fireEvent.click(submit);
	});
	expect(input.onLaunch).toHaveBeenCalledTimes(1);
	expect(input.onLaunch).toHaveBeenCalledWith({
		selection: null,
		identity: "alice",
	});
	expect(view.getByRole("alert").textContent).toBe(
		"Account chat unavailable on this host",
	);
	expect(input.onCancel).not.toHaveBeenCalled();
});
