import { useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	useWorkspaceBranchLabelEnabled,
	useWorkspaceBranchLabelStore,
} from "renderer/stores/workspace-branch-label";

export function WorkspaceBranchLabelSection() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const enabled = useWorkspaceBranchLabelEnabled();
	const setEnabled = useWorkspaceBranchLabelStore((state) => state.setEnabled);

	return (
		<div className="flex items-center justify-between gap-6 p-4">
			<div className="min-w-0 flex-1">
				<Label htmlFor="workspace-branch-label" className="text-sm font-medium">
					<HighlightText
						text={t({
							id: "settings.appearance.workspaceBranchLabel.label",
							message: "Workspace branch names",
						})}
						query={searchQuery}
					/>
				</Label>
				<div className="text-xs text-muted-foreground">
					<HighlightText
						text={t({
							id: "settings.appearance.workspaceBranchLabel.hint",
							message:
								"Show each workspace's branch or worktree name under its title in the sidebar.",
						})}
						query={searchQuery}
					/>
				</div>
			</div>
			<Switch
				id="workspace-branch-label"
				checked={enabled}
				onCheckedChange={setEnabled}
			/>
		</div>
	);
}
