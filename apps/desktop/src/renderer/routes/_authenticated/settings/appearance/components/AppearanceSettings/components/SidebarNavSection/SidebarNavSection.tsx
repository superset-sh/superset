import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import type { SidebarNavItem } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

const SIDEBAR_NAV_ITEMS: ReadonlyArray<{
	id: SidebarNavItem;
	label: string;
	description: string;
}> = [
	{
		id: "workspaces",
		label: "Workspaces",
		description: "Show the Workspaces entry in the sidebar",
	},
	{
		id: "automations",
		label: "Automations",
		description: "Show the Automations entry in the sidebar",
	},
	{
		id: "tasks",
		label: "Tasks & PRs",
		description: "Show the Tasks & PRs entry in the sidebar",
	},
];

export function SidebarNavSection() {
	const { preferences, setSidebarNavItemVisible } = useV2UserPreferences();
	const visibility = preferences.sidebarNavVisibility;

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">Sidebar navigation</h3>
			<p className="text-xs text-muted-foreground mb-3">
				Choose which primary navigation items appear in the sidebar
			</p>
			<div className="space-y-4">
				{SIDEBAR_NAV_ITEMS.map((item) => {
					const switchId = `sidebar-nav-${item.id}`;
					return (
						<div key={item.id} className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label htmlFor={switchId} className="text-sm font-medium">
									{item.label}
								</Label>
								<p className="text-xs text-muted-foreground">
									{item.description}
								</p>
							</div>
							<Switch
								id={switchId}
								checked={visibility[item.id]}
								onCheckedChange={(checked) =>
									setSidebarNavItemVisible(item.id, checked)
								}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
