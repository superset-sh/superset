import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { SavedConversationsFormProps } from "./SavedConversationsForm";
import { SavedConversationsForm } from "./SavedConversationsForm";

afterEach(cleanup);

function props(): SavedConversationsFormProps {
	return {
		accountLabel: "review@example.test",
		rows: [
			"11111111-1111-4111-8111-111111111111",
			"22222222-2222-4222-8222-222222222222",
		].map((nativeSessionId) => ({
			id: nativeSessionId,
			nativeSessionId,
			lastModifiedAt: Date.UTC(2026, 9, 9),
			conversationId: null,
			revision: "fixture-revision",
			canFocusExisting: false,
		})),
		loading: false,
		refreshing: false,
		pending: false,
		hasMore: false,
		error: null,
		onBack: mock(() => {}),
		onRefresh: mock(async () => {}),
		onLoadMore: mock(async () => {}),
		onOpen: mock(async () => {}),
	};
}

test("requires one exact conversation and exit confirmation before a new launch", async () => {
	const input = props();
	const view = render(<SavedConversationsForm {...input} />);
	const submit = view.getByRole("button", {
		name: "Open conversation",
	}) as HTMLButtonElement;
	expect(submit.disabled).toBe(true);
	fireEvent.click(view.getAllByRole("radio")[1] as HTMLElement);
	expect(submit.disabled).toBe(true);
	fireEvent.click(view.getByRole("checkbox"));
	await act(async () => {
		fireEvent.click(submit);
	});
	expect(input.onOpen).toHaveBeenCalledWith(input.rows[1], true);
});

test("changing the selected conversation resets exit confirmation", () => {
	const input = props();
	const view = render(<SavedConversationsForm {...input} />);
	fireEvent.click(view.getAllByRole("radio")[0] as HTMLElement);
	fireEvent.click(view.getByRole("checkbox"));
	fireEvent.click(view.getAllByRole("radio")[1] as HTMLElement);
	expect((view.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
});

test("an existing exact terminal opens without a false exit assertion", async () => {
	const input = props();
	const firstRow = input.rows[0];
	if (!firstRow) throw new Error("Missing fixture row");
	input.rows[0] = {
		...firstRow,
		conversationId: "saved",
		canFocusExisting: true,
	};
	const view = render(<SavedConversationsForm {...input} />);
	fireEvent.click(view.getAllByRole("radio")[0] as HTMLElement);
	expect(view.queryByRole("checkbox")).toBeNull();
	await act(async () => {
		fireEvent.click(
			view.getByRole("button", { name: "Open existing terminal" }),
		);
	});
	expect(input.onOpen).toHaveBeenCalledWith(input.rows[0], false);
});

test("a refreshed revision cannot silently replace the user's selection", () => {
	const input = props();
	const view = render(<SavedConversationsForm {...input} />);
	fireEvent.click(view.getAllByRole("radio")[0] as HTMLElement);
	fireEvent.click(view.getByRole("checkbox"));
	view.rerender(
		<SavedConversationsForm
			{...input}
			rows={input.rows.map((row) => ({ ...row, revision: "changed" }))}
		/>,
	);
	expect(
		(
			view.getByRole("button", {
				name: "Open conversation",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
	expect(view.getByRole("alert").textContent).toContain("Select it again");
	fireEvent.submit(view.container.querySelector("form") as HTMLFormElement);
	expect(input.onOpen).not.toHaveBeenCalled();
});

test("discovery errors block stale rows and show the error", () => {
	const input = props();
	const view = render(<SavedConversationsForm {...input} />);
	fireEvent.click(view.getAllByRole("radio")[0] as HTMLElement);
	fireEvent.click(view.getByRole("checkbox"));
	view.rerender(
		<SavedConversationsForm
			{...input}
			error="Update this host to open saved Claude history."
		/>,
	);
	fireEvent.submit(view.container.querySelector("form") as HTMLFormElement);
	expect(input.onOpen).not.toHaveBeenCalled();
	expect(view.getByRole("alert").textContent).toContain("Update this host");
});

test("a rejected launch stays in the picker and never retries automatically", async () => {
	const input = props();
	input.onOpen = mock(async () => {
		throw new Error("Native history changed");
	});
	const view = render(<SavedConversationsForm {...input} />);
	fireEvent.click(view.getAllByRole("radio")[0] as HTMLElement);
	fireEvent.click(view.getByRole("checkbox"));
	await act(async () => {
		fireEvent.click(view.getByRole("button", { name: "Open conversation" }));
	});
	expect(view.getByRole("alert").textContent).toBe("Native history changed");
	expect(input.onOpen).toHaveBeenCalledTimes(1);
	expect(input.onBack).not.toHaveBeenCalled();
});

test("repeated submit before pending renders launches only once", async () => {
	const input = props();
	let finish!: () => void;
	input.onOpen = mock(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const view = render(<SavedConversationsForm {...input} />);
	fireEvent.click(view.getAllByRole("radio")[0] as HTMLElement);
	fireEvent.click(view.getByRole("checkbox"));
	const form = view.container.querySelector("form") as HTMLFormElement;
	await act(async () => {
		fireEvent.submit(form);
		fireEvent.submit(form);
	});
	expect(input.onOpen).toHaveBeenCalledTimes(1);
	await act(async () => {
		finish();
	});
});

test("loading and empty states are distinct", () => {
	const input = props();
	const view = render(<SavedConversationsForm {...input} rows={[]} loading />);
	expect(view.getByRole("status").textContent).toContain("Loading saved");
	expect(view.queryByText(/No saved Claude conversations/)).toBeNull();
	view.rerender(<SavedConversationsForm {...input} rows={[]} />);
	expect(view.getByText(/No saved Claude conversations/)).not.toBeNull();
});
