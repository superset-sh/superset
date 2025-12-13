import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@superset/ui/sidebar";
import Image from "next/image";

export function AppSidebarHeader() {
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton size="lg" asChild>
					<a href="/">
						<Image
							src="/icon.png"
							alt="Superset"
							width={32}
							height={32}
							className="size-8 rounded-lg"
						/>
						<div className="flex flex-col gap-0.5 leading-none">
							<span className="font-medium">Superset</span>
							<span className="">Admin Panel</span>
						</div>
					</a>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
