import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import {
	useSetWrapWorkspaceNames,
	useWrapWorkspaceNames,
} from "renderer/stores";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function SidebarWorkspaceNamesSection() {
	const wrapWorkspaceNames = useWrapWorkspaceNames();
	const setWrapWorkspaceNames = useSetWrapWorkspaceNames();
	const searchQuery = useSettingsSearchQuery();

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label htmlFor="wrap-workspace-names" className="text-sm font-medium">
					<HighlightText text="Wrap workspace names" query={searchQuery} />
				</Label>
				<p className="text-xs text-muted-foreground">
					Wrap long workspace names onto multiple lines in the sidebar instead
					of cutting them off
				</p>
			</div>
			<Switch
				id="wrap-workspace-names"
				checked={wrapWorkspaceNames}
				onCheckedChange={setWrapWorkspaceNames}
			/>
		</div>
	);
}
