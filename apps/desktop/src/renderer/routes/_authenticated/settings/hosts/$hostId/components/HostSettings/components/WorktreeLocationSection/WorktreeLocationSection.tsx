import { Trans, useLingui } from "@lingui/react/macro";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	useSetV2WorktreeBaseDir,
	useV2WorktreeLocationSettings,
	V2WorktreeLocationPicker,
} from "../../../../../../components/V2WorktreeLocationPicker";

interface WorktreeLocationSectionProps {
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	isOnline: boolean;
	canEdit: boolean;
}

export function WorktreeLocationSection({
	hostUrl,
	hostName,
	isRemoteTarget,
	isOnline,
	canEdit,
}: WorktreeLocationSectionProps) {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const settingsQuery = useV2WorktreeLocationSettings(hostUrl, {
		enabled: isOnline,
	});
	const setLocation = useSetV2WorktreeBaseDir(hostUrl);

	const disabled =
		!canEdit ||
		!isOnline ||
		!hostUrl ||
		settingsQuery.isLoading ||
		setLocation.isPending;

	return (
		<section className="space-y-3">
			<div>
				<h3 className="text-sm font-medium">
					<HighlightText
						text={t({
							message: "Worktrees",
						})}
						query={searchQuery}
					/>
				</h3>
				<p className="mt-0.5 text-sm text-muted-foreground">
					<Trans>
						Default location for new worktree workspaces on this host.
					</Trans>
				</p>
			</div>
			<V2WorktreeLocationPicker
				currentPath={settingsQuery.data?.worktreeBaseDir ?? null}
				fallbackPath={settingsQuery.data?.defaultWorktreeBaseDir ?? null}
				hostUrl={hostUrl}
				hostName={hostName}
				isRemoteTarget={isRemoteTarget}
				disabled={disabled}
				browseTitle={t({
					message: "Select default worktree location",
				})}
				onSelect={(path) => setLocation.mutate(path)}
				onReset={() => setLocation.mutate(null)}
			/>
			{!canEdit ? (
				<p className="text-xs text-muted-foreground">
					<Trans>Only host owners can change this location.</Trans>
				</p>
			) : null}
		</section>
	);
}
