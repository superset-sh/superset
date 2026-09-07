import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document: the screen renders a
// real TanStack router Link. Process-wide, so unregister in afterAll.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const restartMutate = mock((_input: { organizationId: string }) => {});
let hostServiceStatus: "starting" | "running" | "stopped" | "unknown" =
	"running";

// Both mocks spread the real module: mock.module is process-global and a
// partial mock would strip exports other suites import. Both real modules
// load before either mock registers — the provider's import graph reaches
// electronTrpc.createClient, which the stub below must still serve.
const realElectronTrpc = await import("renderer/lib/electron-trpc");
const realLocalHostService = await import(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider"
);
const restartStub = {
	restart: {
		useMutation: () => ({ mutate: restartMutate, isPending: false }),
	},
};
mock.module("renderer/lib/electron-trpc", () => ({
	...realElectronTrpc,
	// A Proxy, not a spread: the real value is a tRPC proxy whose keys
	// (createClient, Provider, every router) only exist on access.
	electronTrpc: new Proxy(realElectronTrpc.electronTrpc, {
		get: (target, prop, receiver) =>
			prop === "hostServiceCoordinator"
				? restartStub
				: Reflect.get(target, prop, receiver),
	}),
}));
mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		...realLocalHostService,
		useLocalHostService: () => ({
			hostServiceStatus,
			activeOrganizationId: "org-1",
			activeHostUrl: "http://127.0.0.1:7001",
			machineId: "local-machine",
		}),
	}),
);

const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { createMemoryHistory, createRootRoute, createRouter, RouterProvider } =
	await import("@tanstack/react-router");
const { WorkspaceLocalHostPendingState } = await import(
	"./WorkspaceLocalHostPendingState"
);

afterEach(() => {
	cleanup();
	restartMutate.mockClear();
	hostServiceStatus = "running";
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function renderScreen(props: { hostId: string; unresponsive?: boolean }) {
	const rootRoute = createRootRoute({
		component: () => <WorkspaceLocalHostPendingState {...props} />,
	});
	const router = createRouter({
		routeTree: rootRoute,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	// The router resolves its first match asynchronously.
	const view = render(<RouterProvider router={router} />);
	return view;
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

describe("WorkspaceLocalHostPendingState", () => {
	test("unresponsive: says the service isn't responding at once, with restart enabled", async () => {
		const { container, getByRole } = renderScreen({
			hostId: "local-machine",
			unresponsive: true,
		});
		await settle();

		// No 10 s grace: the service has already been waited on.
		expect(container.textContent).toContain("Host unreachable");
		expect(container.textContent).toContain(
			"The local host service isn't responding.",
		);
		expect(container.textContent).toContain("local-machine");

		// Not "Starting…": a service with a port that answered nothing is not
		// mid-start, so the restart is offered, not deferred.
		const restart = getByRole("button", { name: /Restart host service/ });
		expect(restart.hasAttribute("disabled")).toBe(false);
		expect(container.textContent).not.toContain("Starting…");
		expect(container.textContent).toContain("Disconnected");

		fireEvent.click(restart);
		expect(restartMutate).toHaveBeenCalledTimes(1);
		expect(restartMutate).toHaveBeenCalledWith({ organizationId: "org-1" });
	});

	test("unresponsive overrides a 'running' coordinator status that would otherwise defer the restart", async () => {
		hostServiceStatus = "running";
		const { container } = renderScreen({
			hostId: "local-machine",
			unresponsive: true,
		});
		await settle();

		expect(container.textContent).toContain("isn't responding");
		expect(container.textContent).not.toContain("just came up");
	});

	test("without unresponsive: holds a blank frame through the boot grace", async () => {
		const { container } = renderScreen({ hostId: "local-machine" });
		await settle();

		expect(container.textContent).not.toContain("Host unreachable");
		expect(restartMutate).not.toHaveBeenCalled();
	});
});
