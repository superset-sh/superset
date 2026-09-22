import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { toast } from "@superset/ui/sonner";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type ActivePlan = {
	organizationId: string | null;
	plan: string;
	status: string | null;
};

const WINDOW_ORG = "org-1";
const proPlanFor = (organizationId: string): ActivePlan => ({
	organizationId,
	plan: "pro",
	status: "active",
});
const freePlanFor = (organizationId: string): ActivePlan => ({
	organizationId,
	plan: "free",
	status: null,
});

// What the billing query already holds when the hook renders.
let cachedPlan: ActivePlan | undefined;
// A plan fetch the test resolves by hand, so two clicks can land while the
// gate is still waiting on it.
let rejectPlan: (error: Error) => void = () => {};
let resolvePlan: (plan: ActivePlan) => void = () => {};
const ensureData = mock(
	() =>
		new Promise<ActivePlan>((resolve, reject) => {
			rejectPlan = reject;
			resolvePlan = resolve;
		}),
);
const fetch = mock(async () => freePlanFor(WINDOW_ORG));
const paywall = mock(() => {});
const toastErrors: string[] = [];

// Patched rather than mocked as a module: the implementation binds the real
// `toast` object, so the patch holds whichever file imported it first.
const realToastError = toast.error;
toast.error = ((title: string) => {
	toastErrors.push(title);
}) as typeof toast.error;

mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpc: {
		useUtils: () => ({ billing: { activePlan: { ensureData, fetch } } }),
		billing: { activePlan: { useQuery: () => ({ data: cachedPlan }) } },
	},
}));
mock.module("renderer/hooks/useActiveOrganizationId", () => ({
	useActiveOrganizationId: () => WINDOW_ORG,
}));
mock.module("./Paywall", () => ({ paywall }));

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { usePaywall } = await import("./usePaywall");

afterEach(() => {
	cleanup();
	cachedPlan = undefined;
	ensureData.mockClear();
	fetch.mockClear();
	paywall.mockClear();
	toastErrors.length = 0;
});
afterAll(async () => {
	toast.error = realToastError;
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

		resolvePlan(proPlanFor(WINDOW_ORG));
		await settle();
		expect(callback).toHaveBeenCalledTimes(1);
	});

	test("accepts a new click once the first has settled", async () => {
		const { result } = renderHook(() => usePaywall());
		const callback = mock(() => {});

		act(() => result.current.gateFeature("automations", callback));
		resolvePlan(proPlanFor(WINDOW_ORG));
		await settle();

		act(() => result.current.gateFeature("automations", callback));
		resolvePlan(proPlanFor(WINDOW_ORG));
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
		resolvePlan(freePlanFor(WINDOW_ORG));
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

	test("says so instead of guessing when the plan cannot be fetched", async () => {
		const { result } = renderHook(() => usePaywall());
		const callback = mock(() => {});

		act(() => result.current.gateFeature("automations", callback));
		rejectPlan(new Error("offline"));
		await settle();
		expect(callback).not.toHaveBeenCalled();
		expect(paywall).not.toHaveBeenCalled();
		expect(toastErrors).toEqual([
			"Could not check your plan. Check your connection and try again.",
		]);
	});
});

describe("whose plan the window is holding", () => {
	test("a cached plan for this organization is ready without a fetch", async () => {
		cachedPlan = proPlanFor(WINDOW_ORG);
		const { result } = renderHook(() => usePaywall());
		expect(result.current.isReady).toBe(true);
		expect(result.current.hasAccess("automations")).toBe(true);

		const callback = mock(() => {});
		act(() => result.current.gateFeature("automations", callback));
		await settle();
		expect(callback).toHaveBeenCalledTimes(1);
		expect(ensureData).not.toHaveBeenCalled();
	});

	// The query is keyed without the organization, so for one render after a
	// switch the cache still holds the previous organization's answer.
	test("a cached Pro plan for another organization is neither ready nor access", () => {
		cachedPlan = proPlanFor("other-org");
		const { result } = renderHook(() => usePaywall());
		expect(result.current.isReady).toBe(false);
		expect(result.current.hasAccess("automations")).toBe(false);
	});

	test("does not grant access on a refetch that still answers for another organization", async () => {
		fetch.mockImplementationOnce(async () => proPlanFor("other-org"));
		const { result } = renderHook(() => usePaywall());
		const callback = mock(() => {});

		act(() => result.current.gateFeature("automations", callback));
		resolvePlan(proPlanFor("other-org"));
		await settle();
		expect(callback).not.toHaveBeenCalled();
		expect(paywall).not.toHaveBeenCalled();
		expect(toastErrors).toHaveLength(1);
	});

	test("refetches when the awaited plan belongs to another organization", async () => {
		const { result } = renderHook(() => usePaywall());
		const callback = mock(() => {});

		act(() => result.current.gateFeature("automations", callback));
		resolvePlan(proPlanFor("other-org"));
		await settle();
		expect(fetch).toHaveBeenCalledWith(undefined, { staleTime: 0 });
		expect(callback).not.toHaveBeenCalled();
		expect(paywall).toHaveBeenCalledTimes(1);
	});
});
