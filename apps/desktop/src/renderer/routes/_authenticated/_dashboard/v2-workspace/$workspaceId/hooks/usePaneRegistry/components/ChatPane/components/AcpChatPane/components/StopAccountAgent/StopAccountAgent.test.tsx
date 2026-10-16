import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
	within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { StopAccountAgent } from "./StopAccountAgent";

const clients: QueryClient[] = [];
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});

function mount(
	closeStoppedAccountSession: ComponentProps<
		typeof StopAccountAgent
	>["closeStoppedAccountSession"],
) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	clients.push(client);
	const onConfirmed = mock(() => {});
	const onStopped = mock(() => {});
	const component = (sessionId = "session-a") => (
		<QueryClientProvider client={client}>
			<StopAccountAgent
				key={`http://host.test:${sessionId}`}
				hostUrl="http://host.test"
				sessionId={sessionId}
				closeStoppedAccountSession={closeStoppedAccountSession}
				onConfirmed={onConfirmed}
				onStopped={onStopped}
			/>
		</QueryClientProvider>
	);
	return { ...render(component()), client, onConfirmed, onStopped, component };
}

test("opening then canceling stop confirmation does not stop or resume anything", async () => {
	const close = mock(async () => {});
	const view = mount(close);
	fireEvent.click(view.getByRole("button", { name: "Stop agent" }));
	const dialog = await view.findByRole("alertdialog");
	expect(within(dialog).getByText(/any background work it owns/)).toBeTruthy();
	expect(close).not.toHaveBeenCalled();
	fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
	await waitFor(() => expect(view.queryByRole("alertdialog")).toBeNull());
	expect(close).not.toHaveBeenCalled();
	expect(view.onConfirmed).not.toHaveBeenCalled();
	expect(view.onStopped).not.toHaveBeenCalled();
});

test("confirmation stops only the exact session once and invalidates only its host-scoped queries", async () => {
	let finish: (() => void) | undefined;
	const close = mock(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const view = mount(close);
	const target = ["acp-chat-session", "http://host.test", "session-a"];
	const queue = ["stopped-account-queue", "http://host.test", "session-a"];
	const otherSession = ["acp-chat-session", "http://host.test", "session-b"];
	const otherHost = ["acp-chat-session", "http://other.test", "session-a"];
	for (const key of [target, queue, otherSession, otherHost])
		view.client.setQueryData(key, { live: true });
	fireEvent.click(view.getByRole("button", { name: "Stop agent" }));
	const dialog = await view.findByRole("alertdialog");
	const confirm = within(dialog).getByRole("button", {
		name: "Stop agent and background work",
	});
	fireEvent.click(confirm);
	fireEvent.click(confirm);
	await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
	expect(close).toHaveBeenCalledWith({ sessionId: "session-a" });
	expect(view.onConfirmed).toHaveBeenCalledTimes(1);
	expect(view.client.getQueryState(target)?.isInvalidated).toBe(false);
	await act(async () => finish?.());
	await waitFor(() => expect(view.queryByRole("alertdialog")).toBeNull());
	expect(view.client.getQueryState(target)?.isInvalidated).toBe(true);
	expect(view.client.getQueryState(queue)?.isInvalidated).toBe(true);
	expect(view.client.getQueryState(otherSession)?.isInvalidated).toBe(false);
	expect(view.client.getQueryState(otherHost)?.isInvalidated).toBe(false);
	expect(view.onStopped).toHaveBeenCalledTimes(1);
});

test("a refused stop keeps confirmation and retry controls without automatic retries", async () => {
	const close = mock(async () => {
		throw new Error("Unsent queue remains");
	});
	const view = mount(close);
	fireEvent.click(view.getByRole("button", { name: "Stop agent" }));
	const dialog = await view.findByRole("alertdialog");
	fireEvent.click(
		within(dialog).getByRole("button", {
			name: "Stop agent and background work",
		}),
	);
	await view.findByRole("alert");
	expect(view.getByRole("alertdialog")).toBeTruthy();
	expect(view.onStopped).not.toHaveBeenCalled();
	await waitFor(() =>
		expect(
			within(dialog)
				.getByRole("button", { name: "Stop agent and background work" })
				.hasAttribute("disabled"),
		).toBe(false),
	);
	expect(close).toHaveBeenCalledTimes(1);
	fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
	await waitFor(() => expect(view.queryByRole("alertdialog")).toBeNull());
	expect(close).toHaveBeenCalledTimes(1);
});

test("an older host missing the strict endpoint fails visibly without another action", async () => {
	const close = mock(async () => {
		throw new Error("NOT_FOUND: closeStoppedAccountSession");
	});
	const view = mount(close);
	fireEvent.click(view.getByRole("button", { name: "Stop agent" }));
	const dialog = await view.findByRole("alertdialog");
	fireEvent.click(
		within(dialog).getByRole("button", {
			name: "Stop agent and background work",
		}),
	);
	await view.findByRole("alert");
	expect(close).toHaveBeenCalledTimes(1);
	expect(view.getByText(/update this host/)).toBeTruthy();
});

test("changing the pane session dismisses the old confirmation instead of stopping a different chat", async () => {
	const close = mock(async () => {});
	const view = mount(close);
	fireEvent.click(view.getByRole("button", { name: "Stop agent" }));
	await view.findByRole("alertdialog");
	view.rerender(view.component("session-b"));
	await waitFor(() => expect(view.queryByRole("alertdialog")).toBeNull());
	expect(close).not.toHaveBeenCalled();
	expect(view.onConfirmed).not.toHaveBeenCalled();
});
