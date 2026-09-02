import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { posthog } from "renderer/lib/posthog";

/** Disabled-skill state and its toggle mutation, with shared toasts/analytics/invalidation. */
export function useSkillMutations() {
	const { t } = useLingui();
	const utils = electronTrpc.useUtils();
	const disabledQuery = electronTrpc.plugins.getDisabledSkills.useQuery();
	const disabledSkills = useMemo(
		() => new Set(disabledQuery.data ?? []),
		[disabledQuery.data],
	);

	const setEnabledMutation = electronTrpc.plugins.setSkillEnabled.useMutation({
		onSuccess: (_data, variables) => {
			void utils.plugins.getDisabledSkills.invalidate();
			posthog.capture(variables.enabled ? "skill_enabled" : "skill_disabled", {
				skill: variables.name,
			});
			toast.success(
				variables.enabled
					? t({
							id: "dashboard.plugins.skillMutations.enabled",
							message: `${variables.name} enabled`,
						})
					: t({
							id: "dashboard.plugins.skillMutations.disabled",
							message: `${variables.name} disabled`,
						}),
				{
					description: t({
						id: "dashboard.plugins.skillMutations.takesEffectNewSessions",
						message: "Takes effect in new agent sessions.",
					}),
				},
			);
		},
		onError: (error) => {
			toast.error(
				t({
					id: "dashboard.plugins.skillMutations.updateFailed",
					message: "Could not update skill",
				}),
				{
					description: errorMessage(error),
				},
			);
		},
	});

	return {
		disabledSkills,
		setEnabled: (name: string, enabled: boolean) =>
			setEnabledMutation.mutate({ name, enabled }),
		// Also true while the initial disabled-list fetch is in flight — until
		// it resolves, disabledSkills is an empty Set, so every skill would
		// otherwise render (and be toggleable) as enabled regardless of its
		// real state.
		isBusy: setEnabledMutation.isPending || disabledQuery.isLoading,
	};
}
