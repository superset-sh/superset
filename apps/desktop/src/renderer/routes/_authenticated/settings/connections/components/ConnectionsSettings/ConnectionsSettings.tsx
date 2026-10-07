import { Trans } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { Redirect } from "renderer/components/Redirect";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { useMacHostOptions } from "../../../hooks/useMacHostOptions";
import {
	getVisibleItemsForSection,
	SETTING_ITEM_ID,
} from "../../../utils/settings-search";
import { GithubConnectionRow } from "./components/GithubConnectionRow";
import { SuperwhisperSettings } from "./components/SuperwhisperSettings";

/** A person's own accounts, as opposed to the organization's integrations. */
export function ConnectionsSettings({ hostId }: { hostId: string | null }) {
	const searchQuery = useSettingsSearchQuery();
	const isV2 = useIsV2CloudEnabled();
	const cloudWorkspaces =
		useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES) === true;
	const macHosts = useMacHostOptions();
	const visibleItems = getVisibleItemsForSection({
		section: "connections",
		searchQuery,
		isV2,
		cloudWorkspaces,
		macHostKnown: macHosts.options.length > 0,
	});
	const showGithub = visibleItems.includes(SETTING_ITEM_ID.CONNECTIONS);
	const showSuperwhisper = visibleItems.includes(
		SETTING_ITEM_ID.CONNECTIONS_SUPERWHISPER,
	);
	if (!showGithub && !showSuperwhisper) {
		if (searchQuery.trim() || !macHosts.settled) return null;
		return <Redirect to="/settings/account" replace />;
	}
	return (
		<div className="w-full max-w-4xl p-6">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans>Connections</Trans>
				</h2>
				{showGithub ? (
					<p className="mt-1 max-w-prose text-sm text-muted-foreground">
						<Trans>
							Your own accounts. Your organization's integrations let Superset
							reach its tools; connecting yours makes the work Superset does for
							you show up as you.
						</Trans>
					</p>
				) : null}
			</div>
			{showGithub ? (
				<div className="divide-y divide-border rounded-md border border-border">
					<GithubConnectionRow />
				</div>
			) : null}
			{showSuperwhisper ? (
				<div className={showGithub ? "mt-8 border-t pt-6" : undefined}>
					<SuperwhisperSettings hostId={hostId} />
				</div>
			) : null}
		</div>
	);
}
