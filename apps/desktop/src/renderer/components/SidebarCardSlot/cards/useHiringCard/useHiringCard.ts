import { useLingui } from "@lingui/react/macro";
import { COMPANY, FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { track } from "renderer/lib/analytics";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useHiringBannerStore } from "renderer/stores/hiring-banner";
import type { SidebarCardEntry } from "../../types";

export function useHiringCard({
	surface,
}: {
	surface: "v1" | "v2";
}): SidebarCardEntry | null {
	const { t } = useLingui();
	const isEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.HIRING_BANNER);
	const dismissed = useHiringBannerStore((s) => s.dismissed);
	const dismiss = useHiringBannerStore((s) => s.dismiss);
	const openUrlMutation = electronTrpc.external.openUrl.useMutation();

	if (!isEnabled || dismissed) return null;

	return {
		id: "hiring",
		badge: t({
			message: "We're hiring",
		}),
		title: t({
			message: "Like building with Superset?",
		}),
		description: t({
			message: "You're one of our most active users. Come help us build it.",
		}),
		actionLabel: t({
			message: "View open roles",
		}),
		onAction: () => {
			track("hiring_banner_clicked");
			openUrlMutation.mutate(COMPANY.CAREERS_URL);
		},
		onDismiss: () => {
			track("hiring_banner_dismissed");
			dismiss();
		},
		onShown: () => track("hiring_banner_shown", { surface }),
	};
}
