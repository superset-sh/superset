import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@superset/ui/sidebar";

export function AppSidebarHeader() {
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton size="lg" asChild>
					<a href="/">
						<img src="/icon.png" alt="Superset" className="size-8 rounded-lg" />
						<div className="flex flex-col gap-0.5 leading-none">
							<span className="font-medium">Superset</span>
						</div>
					</a>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
