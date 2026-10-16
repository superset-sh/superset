import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { StoppedAccountQueue } from "./StoppedAccountQueue";

const clients: QueryClient[] = [];
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});

function mount(
	transport: ComponentProps<typeof StoppedAccountQueue>["transport"],
	allowRegisteredDead = false,
) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	clients.push(client);
	return render(
		<QueryClientProvider client={client}>
			<StoppedAccountQueue
				hostUrl="http://host.test"
				sessionId="session-a"
				transport={transport}
				allowRegisteredDead={allowRegisteredDead}
			/>
		</QueryClientProvider>,
	);
}

const prompt = {
	itemId: "item-a",
	clientId: "client-a",
	queuedAtMs: 1,
	content: [{ type: "text" as const, text: "Unsent review request" }],
};

test("stopped queue is retained until explicit discard and re-read afterward", async () => {
	let prompts = [prompt];
	const removeQueuedPrompt = mock(async () => {
		prompts = [];
	});
	const view = mount({
		getQueue: async () => ({ live: false, paused: true, prompts }),
		removeQueuedPrompt,
	});
	await view.findByText("Unsent review request");
	expect(removeQueuedPrompt).not.toHaveBeenCalled();
	fireEvent.click(view.getByRole("button", { name: "Discard queued message" }));
	await waitFor(() =>
		expect(view.queryByText("Unsent review request")).toBeNull(),
	);
	expect(removeQueuedPrompt).toHaveBeenCalledWith(
		expect.objectContaining({ sessionId: "session-a", itemId: "item-a" }),
	);
});

test("a failed discard keeps the unsent content visible", async () => {
	const view = mount({
		getQueue: async () => ({ live: false, paused: true, prompts: [prompt] }),
		removeQueuedPrompt: async () => {
			throw new Error("Host disconnected");
		},
	});
	await view.findByText("Unsent review request");
	fireEvent.click(view.getByRole("button", { name: "Discard queued message" }));
	await view.findByRole("alert");
	expect(view.getByText("Unsent review request")).toBeTruthy();
});

test("a session that is already live exposes no offline discard controls", async () => {
	const getQueue = mock(async () => ({
		live: true,
		paused: false,
		prompts: [prompt],
	}));
	const view = mount({ getQueue, removeQueuedPrompt: async () => {} });
	await waitFor(() => expect(getQueue).toHaveBeenCalledTimes(1));
	expect(
		view.queryByRole("button", { name: "Discard queued message" }),
	).toBeNull();
});

test("a registered dead session permits explicit queue review without discarding on mount", async () => {
	const removeQueuedPrompt = mock(async () => {});
	const view = mount(
		{
			getQueue: async () => ({ live: true, paused: false, prompts: [prompt] }),
			removeQueuedPrompt,
		},
		true,
	);
	await view.findByText("Unsent review request");
	expect(removeQueuedPrompt).not.toHaveBeenCalled();
	fireEvent.click(view.getByRole("button", { name: "Discard queued message" }));
	await waitFor(() => expect(removeQueuedPrompt).toHaveBeenCalledTimes(1));
	expect(removeQueuedPrompt).toHaveBeenCalledWith(
		expect.objectContaining({ sessionId: "session-a", itemId: "item-a" }),
	);
});
