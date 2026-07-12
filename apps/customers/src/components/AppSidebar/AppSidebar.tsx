import type { RouterOutputs } from "@superset/trpc";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@superset/ui/sidebar";
import { Link, useLocation } from "@tanstack/react-router";
import { LuAtSign, LuBuilding2 } from "react-icons/lu";

import { AppSidebarHeader } from "./components/AppSidebarHeader";
import { NavUser } from "./components/NavUser";

const nav = [
	{
		title: "Companies",
		url: "/companies",
		icon: LuBuilding2,
	},
	{
		title: "Domains",
		url: "/domains",
		icon: LuAtSign,
	},
];

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	user: NonNullable<RouterOutputs["user"]["me"]>;
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
	const pathname = useLocation({ select: (location) => location.pathname });

	return (
		<Sidebar {...props}>
			<SidebarHeader>
				<AppSidebarHeader />
			</SidebarHeader>
			<SidebarContent className="gap-0">
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{nav.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton
										asChild
										isActive={pathname.startsWith(item.url)}
									>
										<Link to={item.url}>
											<item.icon className="size-4" />
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
