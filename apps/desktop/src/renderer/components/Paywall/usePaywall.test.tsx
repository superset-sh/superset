import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import type { AppRouter } from "@superset/trpc";
import type { TRPCLink } from "@trpc/client";
import type { ReactNode } from "react";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { toast } = await import("@superset/ui/sonner");
const { QueryClient } = await import("@tanstack/react-query");
const { TRPCClientError } = await import("@trpc/client");
const { getQueryKey } = await import("@trpc/react-query");
const { observable } = await import("@trpc/server/observable");
const { act, cleanup, renderHook, waitFor } = await import(
	"@testing-library/react"
);
const { cloudTrpc } = await import("renderer/lib/cloud-trpc");
const { CollectionsContext } = await import(
	"renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider"
);
type CollectionsContextType =
	import("renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider").CollectionsContextType;
const { usePaywall } = await import("./usePaywall");

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

interface PlanRequest {
	resolve: (plan: ActivePlan) => void;
	reject: (error: Error) => void;
}
let planRequestCount = 0;
const unansweredPlanRequests: PlanRequest[] = [];
const toastErrors: string[] = [];
const showPaywall = mock(() => {});

const realToastError = toast.error;
toast.error = ((title: string) => {
	toastErrors.push(title);
}) as typeof toast.error;

const planLink: TRPCLink<AppRouter> = () => () =>
	observable((observer) => {
		planRequestCount++;
		unansweredPlanRequests.push({
			resolve: (plan) => {
				observer.next({ result: { data: plan } });
				observer.complete();
			},
			reject: (error) => observer.error(TRPCClientError.from(error)),
		});
	});

function renderPaywall({ cachedPlan }: { cachedPlan?: ActivePlan } = {}) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	if (cachedPlan) {
		queryClient.setQueryData(
			getQueryKey(cloudTrpc.billing.activePlan, undefined, "query"),
			cachedPlan,
		);
	}
	const client = cloudTrpc.createClient({ links: [planLink] });
	const wrapper = ({ children }: { children: ReactNode }) => (
		<cloudTrpc.Provider client={client} queryClient={queryClient}>
			<CollectionsContext.Provider
				value={{ activeOrganizationId: WINDOW_ORG } as CollectionsContextType}
			>
				{children}
			</CollectionsContext.Provider>
		</cloudTrpc.Provider>
	);
	return renderHook(() => usePaywall({ showPaywall }), { wrapper });
}

async function nextPlanRequest(): Promise<PlanRequest> {
	await waitFor(() => expect(unansweredPlanRequests.length).toBeGreaterThan(0));
	return unansweredPlanRequests.shift() as PlanRequest;
}

async function answerPlan(plan: ActivePlan) {
	const request = await nextPlanRequest();
	await act(async () => request.resolve(plan));
}

const settle = () => act(async () => {});

afterEach(() => {
	cleanup();
	planRequestCount = 0;
	unansweredPlanRequests.length = 0;
	toastErrors.length = 0;
	showPaywall.mockClear();
});
afterAll(async () => {
	toast.error = realToastError;
});

describe("gateFeature while the plan is still resolving", () => {
	// The caller's own pending flag only flips once its callback has started,
	// so the gate itself has to drop the second click.
	test("runs the callback once for two immediate clicks", async () => {
		const { result } = renderPaywall();
		const callback = mock(() => {});

		act(() => {
			result.current.gateFeature("automations", callback);
			result.current.gateFeature("automations", callback);
		});

		await answerPlan(proPlanFor(WINDOW_ORG));
		await settle();
		expect(callback).toHaveBeenCalledTimes(1);
		expect(planRequestCount).toBe(1);
	});

	test("accepts a new click once the first has settled", async () => {
		const { result } = renderPaywall();
		const callback = mock(() => {});

		act(() => result.current.gateFeature("automations", callback));
		await answerPlan(proPlanFor(WINDOW_ORG));
		await settle();

		act(() => result.current.gateFeature("automations", callback));
		await settle();
		expect(callback).toHaveBeenCalledTimes(2);
	});

	test("shows the paywall once, not per click, on a free plan", async () => {
		const { result } = renderPaywall();
		const callback = mock(() => {});

		act(() => {
			result.current.gateFeature("automations", callback);
			result.current.gateFeature("automations", callback);
		});
		await answerPlan(freePlanFor(WINDOW_ORG));
		await settle();
		expect(callback).not.toHaveBeenCalled();
		expect(showPaywall).toHaveBeenCalledTimes(1);
		expect(planRequestCount).toBe(1);
	});

	test("gates different features independently", async () => {
		const { result } = renderPaywall();
		const callback = mock(() => {});

		act(() => {
			result.current.gateFeature("automations", callback);
			result.current.gateFeature("tasks", callback);
		});
		await answerPlan(proPlanFor(WINDOW_ORG));
		await settle();
		expect(callback).toHaveBeenCalledTimes(2);
	});

	test("says so instead of guessing when the plan cannot be fetched", async () => {
		const { result } = renderPaywall();
		const callback = mock(() => {});

		act(() => result.current.gateFeature("automations", callback));
		const request = await nextPlanRequest();
		await act(async () => request.reject(new Error("offline")));
		await settle();
		expect(callback).not.toHaveBeenCalled();
		expect(showPaywall).not.toHaveBeenCalled();
		expect(toastErrors).toEqual([
			"Could not check your plan. Check your connection and try again.",
		]);
	});
});

describe("whose plan the window is holding", () => {
	test("a cached plan for this organization is ready without a fetch", async () => {
		const { result } = renderPaywall({ cachedPlan: proPlanFor(WINDOW_ORG) });
		expect(result.current.isReady).toBe(true);
		expect(result.current.hasAccess("automations")).toBe(true);

		const callback = mock(() => {});
		act(() => result.current.gateFeature("automations", callback));
		await settle();
		// The background refresh of the cached plan is still unanswered.
		expect(callback).toHaveBeenCalledTimes(1);
		expect(unansweredPlanRequests).toHaveLength(planRequestCount);
	});

	// The query is keyed without the organization, so for one render after a
	// switch the cache still holds the previous organization's answer.
	test("a cached Pro plan for another organization is neither ready nor access", () => {
		const { result } = renderPaywall({ cachedPlan: proPlanFor("other-org") });
		expect(result.current.isReady).toBe(false);
		expect(result.current.hasAccess("automations")).toBe(false);
	});

	test("does not grant access on a refetch that still answers for another organization", async () => {
		const { result } = renderPaywall();
		const callback = mock(() => {});

		act(() => result.current.gateFeature("automations", callback));
		await answerPlan(proPlanFor("other-org"));
		await answerPlan(proPlanFor("other-org"));
		await settle();
		expect(callback).not.toHaveBeenCalled();
		expect(showPaywall).not.toHaveBeenCalled();
		expect(toastErrors).toHaveLength(1);
	});

	test("refetches when the awaited plan belongs to another organization", async () => {
		const { result } = renderPaywall();
		const callback = mock(() => {});

		act(() => result.current.gateFeature("automations", callback));
		await answerPlan(proPlanFor("other-org"));
		await answerPlan(freePlanFor(WINDOW_ORG));
		await settle();
		expect(planRequestCount).toBe(2);
		expect(callback).not.toHaveBeenCalled();
		expect(showPaywall).toHaveBeenCalledTimes(1);
	});
});
