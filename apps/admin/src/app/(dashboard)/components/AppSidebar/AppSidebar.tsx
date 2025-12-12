"use client";

import type { RouterOutputs } from "@superset/trpc";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@superset/ui/sidebar";
import { LuChevronRight, LuHouse, LuUsers } from "react-icons/lu";

import { AppSidebarHeader } from "./components/AppSidebarHeader";
import { NavUser } from "./components/NavUser";
import { SearchForm } from "./components/SearchForm";

const navigation = [
	{
		title: "Overview",
		items: [
			{
				title: "Dashboard",
				url: "/",
				icon: LuHouse,
			},
		],
	},
	{
		title: "User Management",
		items: [
			{
				title: "All Users",
				url: "/users",
				icon: LuUsers,
			},
			{
				title: "Deleted Users",
				url: "/users/deleted",
			},
		],
	},
];

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	user: NonNullable<RouterOutputs["user"]["me"]>;
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
	return (
		<Sidebar {...props}>
			<SidebarHeader>
				<AppSidebarHeader />
				<SearchForm />
			</SidebarHeader>
			<SidebarContent className="gap-0">
				{navigation.map((section) => (
					<Collapsible
						key={section.title}
						title={section.title}
						defaultOpen
						className="group/collapsible"
					>
						<SidebarGroup>
							<SidebarGroupLabel
								asChild
								className="group/label text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sm"
							>
								<CollapsibleTrigger>
									{section.title}
									<LuChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
								</CollapsibleTrigger>
							</SidebarGroupLabel>
							<CollapsibleContent>
								<SidebarGroupContent>
									<SidebarMenu>
										{section.items.map((item) => (
											<SidebarMenuItem key={item.title}>
												<SidebarMenuButton asChild>
													<a href={item.url}>
														{item.icon && <item.icon className="size-4" />}
														{item.title}
													</a>
												</SidebarMenuButton>
											</SidebarMenuItem>
										))}
									</SidebarMenu>
								</SidebarGroupContent>
							</CollapsibleContent>
						</SidebarGroup>
					</Collapsible>
				))}
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
