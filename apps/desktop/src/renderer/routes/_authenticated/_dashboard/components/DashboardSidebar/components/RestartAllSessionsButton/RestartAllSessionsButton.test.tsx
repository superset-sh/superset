import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const registered = GlobalRegistrator.isRegistered;
if (!registered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const originalClient = {
	...(await import("renderer/lib/host-service-client")),
};
const originalSonner = { ...(await import("@superset/ui/sonner")) };
const query = mock(async () => [
	{ terminalId: "gemini", workspaceId: "ws-1", agentLabel: "Gemini" },
]);
const mutate = mock(async (_input: { terminalIds: string[] }) => ({
	restartedTerminalIds: ["gemini"],
	failedTerminalIds: [] as string[],
}));
const success = mock((_message: string) => {});
const error = mock((_message: string) => {});
mock.module("renderer/lib/host-service-client", () => ({
	...originalClient,
	getHostServiceClientByUrl: () => ({
		terminalAgents: {
			restartCandidates: { query },
			restartSessions: { mutate },
		},
	}),
}));
mock.module("@superset/ui/sonner", () => ({
	toast: { success, error, info: mock(() => {}) },
}));
const { act, cleanup, fireEvent, render, within, waitFor } = await import(
	"@testing-library/react"
);
const { RestartAllSessionsButton } = await import("./RestartAllSessionsButton");
let client: QueryClient;
beforeEach(() => {
	client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	query.mockClear();
	mutate.mockClear();
	success.mockClear();
	error.mockClear();
	mutate.mockImplementation(async () => ({
		restartedTerminalIds: ["gemini"],
		failedTerminalIds: [],
	}));
});
afterEach(() => {
	cleanup();
	client.clear();
});
afterAll(async () => {
	mock.module("renderer/lib/host-service-client", () => originalClient);
	mock.module("@superset/ui/sonner", () => originalSonner);
	if (!registered) await GlobalRegistrator.unregister();
});
function show(hostUrl: string | null = "http://127.0.0.1:1234") {
	return render(
		<QueryClientProvider client={client}>
			<RestartAllSessionsButton hostUrl={hostUrl} isCollapsed={false} />
		</QueryClientProvider>,
	);
}
async function openConfirmation() {
	await act(async () =>
		fireEvent.click(
			within(document.body).getByRole("button", {
				name: "Restart all sessions",
			}),
		),
	);
	return await within(document.body).findByRole("alertdialog");
}
test("requires confirmation and cancellation leaves every agent running", async () => {
	show();
	const dialog = await openConfirmation();
	expect(query).toHaveBeenCalledTimes(1);
	expect(mutate).not.toHaveBeenCalled();
	await act(async () =>
		fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })),
	);
	expect(mutate).not.toHaveBeenCalled();
});
test("restarts the confirmed session ids and reports success", async () => {
	show();
	const dialog = await openConfirmation();
	await act(async () =>
		fireEvent.click(within(dialog).getByRole("button", { name: "Restart" })),
	);
	await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
	expect(mutate).toHaveBeenCalledWith({ terminalIds: ["gemini"] });
});
test("reports partial failure instead of announcing complete success", async () => {
	mutate.mockImplementation(async () => ({
		restartedTerminalIds: [],
		failedTerminalIds: ["gemini"],
	}));
	show();
	const dialog = await openConfirmation();
	await act(async () =>
		fireEvent.click(within(dialog).getByRole("button", { name: "Restart" })),
	);
	await waitFor(() => expect(error).toHaveBeenCalledTimes(1));
	expect(success).not.toHaveBeenCalled();
});
test("is disabled without a host connection", () => {
	show(null);
	const button = within(document.body).getByRole("button", {
		name: "Restart all sessions",
	}) as HTMLButtonElement;
	expect(button.disabled).toBe(true);
	fireEvent.click(button);
	expect(query).not.toHaveBeenCalled();
});

test("does not restart sessions after the active host changes", async () => {
	const view = show();
	await openConfirmation();
	view.rerender(
		<QueryClientProvider client={client}>
			<RestartAllSessionsButton
				hostUrl="http://127.0.0.1:4321"
				isCollapsed={false}
			/>
		</QueryClientProvider>,
	);
	expect(within(document.body).queryByRole("alertdialog")).toBeNull();
	expect(mutate).not.toHaveBeenCalled();
});

test("disables repeated requests while a restart is pending", async () => {
	let resolveRestart = (_value: {
		restartedTerminalIds: string[];
		failedTerminalIds: string[];
	}) => {};
	mutate.mockImplementation(
		() =>
			new Promise((resolve) => {
				resolveRestart = resolve;
			}),
	);
	show();
	const dialog = await openConfirmation();
	await act(async () =>
		fireEvent.click(within(dialog).getByRole("button", { name: "Restart" })),
	);
	await waitFor(() =>
		expect(
			(
				within(document.body).getByRole("button", {
					name: "Restart all sessions",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true),
	);
	fireEvent.click(
		within(document.body).getByRole("button", { name: "Restart all sessions" }),
	);
	expect(mutate).toHaveBeenCalledTimes(1);
	await act(async () =>
		resolveRestart({ restartedTerminalIds: ["gemini"], failedTerminalIds: [] }),
	);
});
