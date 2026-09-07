import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document: the hook renders under
// a real router and QueryClientProvider. Process-wide, so unregister in
// afterAll for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const LOCAL_URL = "http://127.0.0.1:7001";
const RELAY_URL = "https://relay.test";
const REMOTE_MACHINE = "remote-machine";
const LOCAL_MACHINE = "local-machine";

type HostBehaviour = "answer" | "error";
/** What each host does when its workspace.list is asked, keyed by URL prefix. */
const behaviour = new Map<string, HostBehaviour>();
function hostFor(url: string): string {
	return url.startsWith(LOCAL_URL) ? LOCAL_MACHINE : REMOTE_MACHINE;
}

// Every mock spreads the real module: mock.module is process-global and a
// partial mock would strip exports other suites import. Reals load before any
// mock registers so their import graphs see real modules.
const realLocalHostService = await import(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider"
);
const realRelayUrl = await import("renderer/hooks/useRelayUrl");
const realKnownHosts = await import("renderer/hooks/known-hosts/useKnownHosts");
const realSandboxAccess = await import(
	"renderer/routes/_authenticated/providers/SandboxAccessProvider"
);
const realAuthClient = await import("renderer/lib/auth-client");
const realEventBus = await import("renderer/lib/host-event-bus");
const realHostServiceClient = await import("renderer/lib/host-service-client");
const realIdb = await import("idb-keyval");

mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		...realLocalHostService,
		useLocalHostService: () => ({
			activeHostUrl: LOCAL_URL,
			machineId: LOCAL_MACHINE,
			hostServiceStatus: "running",
			activeOrganizationId: "org-1",
		}),
	}),
);
mock.module("renderer/hooks/useRelayUrl", () => ({
	...realRelayUrl,
	useRelayUrl: () => RELAY_URL,
}));
mock.module("renderer/hooks/known-hosts/useKnownHosts", () => ({
	...realKnownHosts,
	useKnownHosts: () => ({
		hosts: [
			{ organizationId: "org-1", machineId: LOCAL_MACHINE, isOnline: true },
			{ organizationId: "org-1", machineId: REMOTE_MACHINE, isOnline: true },
		],
		organizationId: "org-1",
		settled: true,
	}),
}));
mock.module(
	"renderer/routes/_authenticated/providers/SandboxAccessProvider",
	() => ({
		...realSandboxAccess,
		useSandboxAccess: () => ({ targets: [], isReady: true }),
	}),
);
mock.module("renderer/lib/auth-client", () => ({
	...realAuthClient,
	// The real value is a better-auth proxy; only useSession is stubbed.
	authClient: new Proxy(realAuthClient.authClient, {
		get: (target, prop, receiver) =>
			prop === "useSession"
				? () => ({ data: null })
				: Reflect.get(target, prop, receiver),
	}),
}));
mock.module("renderer/lib/host-event-bus", () => ({
	...realEventBus,
	getHostEventBus: () => ({
		on: () => () => {},
		getConnectionStatus: () => ({ state: "closed" }),
		subscribeConnectionStatus: () => () => {},
		retain: () => () => {},
	}),
}));
mock.module("renderer/lib/host-service-client", () => ({
	...realHostServiceClient,
	getHostServiceClientByUrl: (url: string) => ({
		workspace: {
			list: {
				query: async () => {
					if (behaviour.get(hostFor(url)) === "error") {
						throw new Error(`${hostFor(url)} unreachable`);
					}
					return [];
				},
			},
		},
	}),
}));
// No IndexedDB under happy-dom; the snapshot cache is best-effort anyway.
mock.module("idb-keyval", () => ({
	...realIdb,
	get: async () => undefined,
	set: async () => {},
}));

const { act, cleanup, render } = await import("@testing-library/react");

// Not testing-library's waitFor: in a full-suite run it stays bound to the
// happy-dom window of whichever file imported it first, and once that file
// unregisters, its timers never fire and waitFor only times out. Poll on the
// live window's timer instead, flushing React inside act each round.
const liveSetTimeout = globalThis.setTimeout;
async function until(check: () => void, timeoutMs = 3_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			check();
			return;
		} catch (error) {
			if (Date.now() > deadline) throw error;
		}
		await act(async () => {
			await new Promise((resolve) => liveSetTimeout(resolve, 10));
		});
	}
}
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { createMemoryHistory, createRootRoute, createRouter, RouterProvider } =
	await import("@tanstack/react-router");
const { useHostWorkspacesSource } = await import("./useHostWorkspaces");
type Result = ReturnType<typeof useHostWorkspacesSource>;

afterEach(() => {
	cleanup();
	behaviour.clear();
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/** Mount the unscoped hook under a router (useParams) and a fresh QueryClient. */
async function mountHook() {
	const holder: { current: Result | null } = { current: null };
	function Probe() {
		holder.current = useHostWorkspacesSource();
		return null;
	}
	const rootRoute = createRootRoute({ component: Probe });
	const router = createRouter({
		routeTree: rootRoute,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	const queryClient = new QueryClient({
		// The hook's own `retry: 1` stays; only the backoff is shortened.
		defaultOptions: { queries: { retryDelay: 0 } },
	});
	render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
	await until(() => expect(holder.current?.isReady).toBe(true));
	const current = () => {
		if (!holder.current) throw new Error("hook not mounted");
		return holder.current;
	};
	return { current };
}

async function refetchAll(current: () => Result): Promise<boolean> {
	let answered: boolean | undefined;
	await act(async () => {
		answered = await current().cache.refetchAll();
	});
	if (answered === undefined) throw new Error("refetchAll did not resolve");
	return answered;
}

describe("useHostWorkspaces cache.refetchAll", () => {
	test("resolves true when a host answers after the request began", async () => {
		behaviour.set(LOCAL_MACHINE, "answer");
		behaviour.set(REMOTE_MACHINE, "answer");
		const { current } = await mountHook();

		expect(await refetchAll(current)).toBe(true);
	});

	test("resolves true when only one host answers and the other errors", async () => {
		behaviour.set(LOCAL_MACHINE, "answer");
		behaviour.set(REMOTE_MACHINE, "answer");
		const { current } = await mountHook();

		behaviour.set(LOCAL_MACHINE, "error");
		expect(await refetchAll(current)).toBe(true);
	});

	test("resolves false when every host errored, even with an earlier answer in the cache", async () => {
		behaviour.set(LOCAL_MACHINE, "answer");
		behaviour.set(REMOTE_MACHINE, "answer");
		const { current } = await mountHook();
		// The earlier successful fetch is still cached; it must not count as
		// an answer to this request.
		expect(current().workspaces).toEqual([]);

		behaviour.set(LOCAL_MACHINE, "error");
		behaviour.set(REMOTE_MACHINE, "error");
		expect(await refetchAll(current)).toBe(false);
	});

	test("resolves false when the hosts errored from the start", async () => {
		behaviour.set(LOCAL_MACHINE, "error");
		behaviour.set(REMOTE_MACHINE, "error");
		const { current } = await mountHook();

		expect(await refetchAll(current)).toBe(false);
	});
});
