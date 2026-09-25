import { useLingui } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useNavigate } from "@tanstack/react-router";
import { useActiveFeatureFlags, useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect } from "react";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import type { SidebarCardEntry } from "renderer/components/SidebarCardSlot/types";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useGettingStartedStore } from "renderer/stores/getting-started";
import { GettingStartedChecklist } from "./components/GettingStartedChecklist";
import { GETTING_STARTED_STEPS } from "./constants";

export function useGettingStartedCard(): SidebarCardEntry | null {
	const { t } = useLingui();
	const { tried, dismissed, dismiss, hasCompleted, complete } =
		useGettingStartedStore();
	const navigate = useNavigate();
	const { gateFeature, hasAccess, isReady } = usePaywall();
	const flags = useActiveFeatureFlags();
	const mobileFlag = useFeatureFlagEnabled(FEATURE_FLAGS.MOBILE_LAUNCH);
	const mobileEnabled = mobileFlag === true;
	const visible =
		!dismissed && isReady && hasAccess(GATED_FEATURES.REMOTE_ACCESS);
	const { data: remoteEnabled } =
		electronTrpc.settings.getExposeHostServiceViaRelay.useQuery(undefined, {
			enabled: visible,
		});
	const { data: automations } = cloudTrpc.automation.list.useQuery(undefined, {
		enabled: visible,
	});
	const completed =
		(tried & 1) | (remoteEnabled ? 2 : 0) | (automations?.length ? 4 : 0);
	const steps = GETTING_STARTED_STEPS.filter(
		(step) => step.feature !== GATED_FEATURES.MOBILE_APP || mobileEnabled,
	);
	const allCompleted = steps.every(
		(step) => (completed & (1 << step.progressIndex)) !== 0,
	);
	const shouldComplete =
		visible && flags !== undefined && allCompleted && !hasCompleted;
	useEffect(() => {
		if (shouldComplete) complete();
	}, [shouldComplete, complete]);
	if (!visible || shouldComplete) return null;
	return {
		id: "pro-getting-started",
		title: t({ message: "Get the best out of Pro" }),
		onDismiss: dismiss,
		children: (
			<GettingStartedChecklist
				completed={completed}
				steps={steps}
				onStart={(index) => {
					const step = steps[index];
					if (step) gateFeature(step.feature, () => navigate({ to: step.to }));
				}}
			/>
		),
	};
}
