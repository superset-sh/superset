import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import type { SidebarNavItem } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

const SIDEBAR_NAV_ITEMS: ReadonlyArray<{
	id: SidebarNavItem;
	label: string;
	description: string;
	/** When true, only shown while the v2 dashboard sidebar is active. */
	v2Only?: boolean;
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
		v2Only: true,
	},
	{
		id: "tasks",
		label: "Tasks & PRs",
		description: "Show the Tasks & PRs entry in the sidebar",
	},
];

export function SidebarNavSection() {
	const isV2 = useIsV2CloudEnabled();
	const { preferences, setSidebarNavItemVisible } = useV2UserPreferences();
	const visibility = preferences.sidebarNavVisibility;
	const items = SIDEBAR_NAV_ITEMS.filter((item) => !item.v2Only || isV2);

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">Sidebar navigation</h3>
			<p className="text-xs text-muted-foreground mb-3">
				Choose which primary navigation items appear in the sidebar
			</p>
			<div className="space-y-4">
				{items.map((item) => {
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
