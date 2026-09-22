import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GATED_FEATURES } from "renderer/components/Paywall/constants";

const router = await import("@tanstack/react-router");
let paid = true;
let isReady = true;
let dismissed = false;
let hasCompleted = false;
let allowed = true;
let flagsLoaded = true;
let mobileEnabled: boolean | undefined = true;
let remoteEnabled: boolean | undefined = false;
let automations: unknown[] | undefined = [];
let tried = 0;
const navigate = mock(async (_options: { to: string }) => {});
const gateFeature = mock((_feature: string, start: () => Promise<void>) => {
	if (allowed) return start();
});
mock.module("@tanstack/react-router", () => ({
	...router,
	useNavigate: () => navigate,
}));
mock.module("posthog-js/react", () => ({
	useFeatureFlagEnabled: () => mobileEnabled,
	useActiveFeatureFlags: () => (flagsLoaded ? [] : undefined),
}));
mock.module("renderer/components/Paywall", () => ({
	GATED_FEATURES,
	usePaywall: () => ({ hasAccess: () => paid, isReady, gateFeature }),
}));
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		settings: {
			getExposeHostServiceViaRelay: {
				useQuery: () => ({ data: remoteEnabled }),
			},
		},
	},
}));
mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpc: {
		automation: { list: { useQuery: () => ({ data: automations }) } },
	},
}));
mock.module("renderer/stores/getting-started", () => ({
	useGettingStartedStore: () => ({
		tried,
		dismissed,
		hasCompleted,
		complete: () => {},
		dismiss: () => {},
	}),
}));

const { useGettingStartedCard } = await import("../useGettingStartedCard");
let card: ReturnType<typeof useGettingStartedCard>;
function Probe() {
	card = useGettingStartedCard();
	return null;
}
function props() {
	return (
		card?.children as ReactElement<{
			onStart: (step: number) => void;
			completed: number;
			steps: { to: string }[];
		}>
	).props;
}
beforeEach(() => {
	paid = true;
	isReady = true;
	dismissed = false;
	hasCompleted = false;
	allowed = true;
	mobileEnabled = true;
	flagsLoaded = true;
	remoteEnabled = false;
	automations = [];
	tried = 0;
	navigate.mockClear();
	gateFeature.mockClear();
});

describe("Pro getting-started card", () => {
	test("shows for paid plans only after billing resolves, and honors dismissal", () => {
		renderToStaticMarkup(<Probe />);
		expect(card).not.toBeNull();
		paid = false;
		renderToStaticMarkup(<Probe />);
		expect(card).toBeNull();
		paid = true;
		isReady = false;
		renderToStaticMarkup(<Probe />);
		expect(card).toBeNull();
		isReady = true;
		dismissed = true;
		renderToStaticMarkup(<Probe />);
		expect(card).toBeNull();
	});
	test("opens the setup destinations without completing them", () => {
		renderToStaticMarkup(<Probe />);
		for (const [index, feature] of [
			GATED_FEATURES.REMOTE_ACCESS,
			GATED_FEATURES.MOBILE_APP,
			GATED_FEATURES.AUTOMATIONS,
		].entries()) {
			props().onStart(index);
			expect(gateFeature).toHaveBeenLastCalledWith(
				feature,
				expect.any(Function),
			);
			expect(navigate).toHaveBeenLastCalledWith({
				to: ["/settings/security", "/settings/mobile", "/automations"][index],
			});
		}
		expect(props().completed).toBe(0);
	});
	test("tracks live remote and automation state independently of old stored progress", () => {
		tried = 6;
		renderToStaticMarkup(<Probe />);
		expect(props().completed).toBe(0);
		remoteEnabled = true;
		automations = [{ id: "automation" }];
		renderToStaticMarkup(<Probe />);
		expect(props().completed).toBe(6);
		tried = 1;
		renderToStaticMarkup(<Probe />);
		expect(card).toBeNull();
		remoteEnabled = false;
		automations = [];
		renderToStaticMarkup(<Probe />);
		expect(props().completed).toBe(1);
	});
	test("hides on first completion of all available steps", () => {
		remoteEnabled = true;
		automations = [{ id: "automation" }];
		mobileEnabled = false;
		renderToStaticMarkup(<Probe />);
		expect(card).toBeNull();
		mobileEnabled = true;
		renderToStaticMarkup(<Probe />);
		expect(card).not.toBeNull();
		tried = 1;
		renderToStaticMarkup(<Probe />);
		expect(card).toBeNull();
	});
	test("does not auto-complete before mobile availability resolves", () => {
		flagsLoaded = false;
		mobileEnabled = undefined;
		remoteEnabled = true;
		automations = [{ id: "automation" }];
		renderToStaticMarkup(<Probe />);
		expect(card).not.toBeNull();
	});
	test("keeps completed onboarding dismissed and allows explicitly reopening it", () => {
		hasCompleted = true;
		dismissed = true;
		renderToStaticMarkup(<Probe />);
		expect(card).toBeNull();
		dismissed = false;
		remoteEnabled = true;
		automations = [{ id: "automation" }];
		tried = 1;
		renderToStaticMarkup(<Probe />);
		expect(card).not.toBeNull();
	});
	test("does not infer setup from missing query data", () => {
		remoteEnabled = undefined;
		automations = undefined;
		renderToStaticMarkup(<Probe />);
		expect(props().completed).toBe(0);
	});
	test("hides mobile until the flag is enabled and keeps automation navigation correct", () => {
		for (const value of [false, undefined]) {
			mobileEnabled = value;
			renderToStaticMarkup(<Probe />);
			expect(props().steps.map((step) => step.to)).toEqual([
				"/settings/security",
				"/automations",
			]);
			props().onStart(1);
			expect(navigate).toHaveBeenLastCalledWith({ to: "/automations" });
		}
	});
	test("does not navigate when entitlement is revoked before clicking", () => {
		renderToStaticMarkup(<Probe />);
		allowed = false;
		props().onStart(1);
		expect(navigate).not.toHaveBeenCalled();
	});
});
