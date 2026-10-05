import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
	QueryClient,
	QueryClientProvider,
	skipToken,
} from "@tanstack/react-query";

const registered = GlobalRegistrator.isRegistered;
if (!registered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type State = "open" | "reconnecting";
const hosts = new Map<string, ReturnType<typeof makeHost>>();
let hostUrl = "http://host-a";
function makeHost() {
	let state: State = "open";
	let refs = 0;
	const listeners = new Set<(status: { state: State }) => void>();
	return {
		watchers: [] as { pageId: string }[],
		bindings: [] as { terminalId: string }[],
		reads: 0,
		gate: undefined as Promise<void> | undefined,
		getConnectionStatus: () => ({ state }),
		subscribeConnectionStatus(callback: (status: { state: State }) => void) {
			listeners.add(callback);
			return () => listeners.delete(callback);
		},
		retain() {
			refs++;
			return () => refs--;
		},
		emit(next: State) {
			state = next;
			for (const listener of listeners) listener({ state });
		},
		get retained() {
			return refs;
		},
		get subscribers() {
			return listeners.size;
		},
	};
}
mock.module("renderer/lib/host-event-bus", () => ({
	getHostEventBus: (url: string) => hosts.get(url),
}));
mock.module("../../useWorkspaceHostUrl", () => ({
	useWorkspaceHostUrl: () => hostUrl,
}));
mock.module("../../useWorkspaceEvent", () => ({ useWorkspaceEvent: () => {} }));
const getHostServiceClientByUrl = (url: string) => ({
	pageWatch: {
		getAll: {
			query: async () => {
				const host = hosts.get(url);
				if (!host) throw new Error(`Missing host ${url}`);
				host.reads++;
				await host.gate;
				return host.watchers;
			},
		},
	},
	terminalAgents: {
		listByWorkspace: {
			query: async () => {
				const host = hosts.get(url);
				if (!host) throw new Error(`Missing host ${url}`);
				host.reads++;
				await host.gate;
				return host.bindings;
			},
		},
	},
});
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl,
	hostServiceQueryFn: (
		url: string | null,
		query: (
			client: ReturnType<typeof getHostServiceClientByUrl>,
			context: { signal: AbortSignal },
		) => unknown,
	) =>
		url === null
			? skipToken
			: (context: { signal: AbortSignal }) =>
					query(getHostServiceClientByUrl(url), context),
}));
const { act, cleanup, render, waitFor } = await import(
	"@testing-library/react"
);
const { usePageWatchers } = await import("../../usePageWatchers");
const { useTerminalAgentBindings } = await import(
	"../../useTerminalAgentBindings"
);
function Probe() {
	const watchers = usePageWatchers("workspace");
	const bindings = useTerminalAgentBindings("workspace");
	return <output>{[...watchers.keys(), ...bindings.keys()].join(",")}</output>;
}
function windowTree(client: QueryClient) {
	return (
		<QueryClientProvider client={client}>
			<Probe />
		</QueryClientProvider>
	);
}
const clients: QueryClient[] = [];
function client() {
	const next = new QueryClient({
		defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
	});
	clients.push(next);
	return next;
}
afterEach(() => {
	cleanup();
	for (const next of clients.splice(0)) next.clear();
	for (const host of hosts.values()) {
		expect(host.retained).toBe(0);
		expect(host.subscribers).toBe(0);
	}
	hosts.clear();
	hostUrl = "http://host-a";
});
afterAll(async () => {
	if (!registered) await GlobalRegistrator.unregister();
});
test("both windows recover watcher and agent changes missed during disconnect", async () => {
	const host = makeHost();
	hosts.set(hostUrl, host);
	const first = render(windowTree(client()));
	const second = render(windowTree(client()));
	await waitFor(() => expect(host.reads).toBeGreaterThanOrEqual(4));
	await act(async () => {
		host.emit("reconnecting");
	});
	host.watchers = [{ pageId: "new-page" }];
	host.bindings = [{ terminalId: "new-agent" }];
	await act(async () => {
		host.emit("open");
	});
	await waitFor(() => {
		expect(first.container.textContent).toBe("new-page,new-agent");
		expect(second.container.textContent).toBe("new-page,new-agent");
	});
	const reads = host.reads;
	await act(async () => {
		host.emit("open");
	});
	expect(host.reads).toBe(reads);
});
test("a changed host target refreshes fresh cached data without waiting for an event", async () => {
	const a = makeHost();
	a.watchers = [{ pageId: "old-page" }];
	a.bindings = [{ terminalId: "old-agent" }];
	hosts.set(hostUrl, a);
	const queryClient = client();
	const view = render(windowTree(queryClient));
	await waitFor(() =>
		expect(view.container.textContent).toBe("old-page,old-agent"),
	);
	const b = makeHost();
	b.watchers = [{ pageId: "new-page" }];
	b.bindings = [{ terminalId: "new-agent" }];
	hostUrl = "https://relay/hosts/new-host";
	hosts.set(hostUrl, b);
	view.rerender(windowTree(queryClient));
	await waitFor(() =>
		expect(view.container.textContent).toBe("new-page,new-agent"),
	);
	expect(a.subscribers).toBe(0);
	expect(a.retained).toBe(0);
	const reads = b.reads;
	await act(async () => {
		a.emit("reconnecting");
		a.emit("open");
	});
	expect(b.reads).toBe(reads);
});

test("host switch cancels a pending initial response before it can populate workspace cache", async () => {
	const oldHost = makeHost();
	let release: () => void = () => {};
	oldHost.gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	oldHost.watchers = [{ pageId: "stale-page" }];
	oldHost.bindings = [{ terminalId: "stale-agent" }];
	hosts.set(hostUrl, oldHost);
	const queryClient = client();
	const view = render(windowTree(queryClient));
	await waitFor(() => expect(oldHost.reads).toBeGreaterThanOrEqual(2));
	const current = makeHost();
	current.watchers = [{ pageId: "current-page" }];
	current.bindings = [{ terminalId: "current-agent" }];
	hostUrl = "https://relay/hosts/replacement";
	hosts.set(hostUrl, current);
	view.rerender(windowTree(queryClient));
	await waitFor(() =>
		expect(view.container.textContent).toBe("current-page,current-agent"),
	);
	await act(async () => {
		release();
	});
	await waitFor(() =>
		expect(view.container.textContent).toBe("current-page,current-agent"),
	);
	expect(
		queryClient.getQueryData<typeof current.watchers>([
			"page-watchers",
			"workspace",
		]),
	).toEqual(current.watchers);
	expect(
		queryClient.getQueryData<typeof current.bindings>([
			"terminal-agent-bindings",
			"workspace",
		]),
	).toEqual(current.bindings);
});

test("mounting additional consumers and remounting preserves a fresh workspace cache", async () => {
	const host = makeHost();
	host.watchers = [{ pageId: "cached-page" }];
	host.bindings = [{ terminalId: "cached-agent" }];
	hosts.set(hostUrl, host);
	const queryClient = client();
	const first = render(windowTree(queryClient));
	await waitFor(() =>
		expect(first.container.textContent).toBe("cached-page,cached-agent"),
	);
	expect(host.reads).toBe(2);
	const second = render(windowTree(queryClient));
	await act(async () => {});
	expect(second.container.textContent).toBe("cached-page,cached-agent");
	expect(host.reads).toBe(2);
	first.unmount();
	second.unmount();
	const remounted = render(windowTree(queryClient));
	await act(async () => {});
	expect(remounted.container.textContent).toBe("cached-page,cached-agent");
	expect(host.reads).toBe(2);
	await act(async () => {
		host.emit("reconnecting");
		host.emit("open");
	});
	await waitFor(() => expect(host.reads).toBe(4));
});
