import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// A plan fetch the test resolves by hand, so two clicks can land while the
// gate is still waiting on it.
let resolvePlan: (plan: { plan: string } | null) => void = () => {};
const ensureData = mock(
	() =>
		new Promise<{ plan: string } | null>((resolve) => {
			resolvePlan = resolve;
		}),
);
const paywall = mock(() => {});

mock.module("renderer/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: { session: { plan: null } } }) },
}));
mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpc: {
		useUtils: () => ({ billing: { activePlan: { ensureData } } }),
		billing: { activePlan: { useQuery: () => ({ data: undefined }) } },
	},
}));
mock.module("renderer/hooks/useActiveOrganizationId", () => ({
	useActiveOrganizationId: () => "org-1",
}));
mock.module("./Paywall", () => ({ paywall }));

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { usePaywall } = await import("./usePaywall");

afterEach(() => {
	cleanup();
	ensureData.mockClear();
	paywall.mockClear();
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const settle = () => act(async () => {});

describe("gateFeature while the plan is still resolving", () => {
	// The caller's own pending flag only flips once its callback has started,
	// so the gate itself has to drop the second click.
	test("runs the callback once for two immediate clicks", async () => {
		const { result } = renderHook(() => usePaywall());
		const callback = mock(() => {});

		act(() => {
			result.current.gateFeature("automations", callback);
			result.current.gateFeature("automations", callback);
		});
		expect(ensureData).toHaveBeenCalledTimes(1);

		resolvePlan({ plan: "pro" });
		await settle();
		expect(callback).toHaveBeenCalledTimes(1);
	});

	test("accepts a new click once the first has settled", async () => {
		const { result } = renderHook(() => usePaywall());
		const callback = mock(() => {});

		act(() => result.current.gateFeature("automations", callback));
		resolvePlan({ plan: "pro" });
		await settle();

		act(() => result.current.gateFeature("automations", callback));
		resolvePlan({ plan: "pro" });
		await settle();
		expect(callback).toHaveBeenCalledTimes(2);
	});

	test("shows the paywall once, not per click, on a free plan", async () => {
		const { result } = renderHook(() => usePaywall());
		const callback = mock(() => {});

		act(() => {
			result.current.gateFeature("automations", callback);
			result.current.gateFeature("automations", callback);
		});
		resolvePlan(null);
		await settle();
		expect(callback).not.toHaveBeenCalled();
		expect(paywall).toHaveBeenCalledTimes(1);
	});

	test("gates different features independently", async () => {
		const { result } = renderHook(() => usePaywall());
		const callback = mock(() => {});

		act(() => {
			result.current.gateFeature("automations", callback);
			result.current.gateFeature("tasks", callback);
		});
		expect(ensureData).toHaveBeenCalledTimes(2);
	});
});
