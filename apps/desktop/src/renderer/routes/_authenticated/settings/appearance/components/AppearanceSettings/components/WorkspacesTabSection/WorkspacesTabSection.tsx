import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import {
	useIsWorkspacesTabVisible,
	useSetWorkspacesTabVisible,
} from "renderer/stores/sidebar-workspaces-tab";

export function WorkspacesTabSection() {
	const isVisible = useIsWorkspacesTabVisible();
	const setVisible = useSetWorkspacesTabVisible();

	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label htmlFor="show-workspaces-tab" className="text-sm font-medium">
					Show Workspaces tab
				</Label>
				<p className="text-xs text-muted-foreground">
					Add a Workspaces entry to the sidebar that opens the full workspace
					list. It is also reachable from the command palette.
				</p>
			</div>
			<Switch
				id="show-workspaces-tab"
				checked={isVisible}
				onCheckedChange={setVisible}
			/>
		</div>
	);
}
