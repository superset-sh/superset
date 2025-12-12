"use client";

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
import {
	BarChart3,
	Bot,
	ChevronRight,
	Database,
	Home,
	Settings,
	Shield,
	Users,
	Webhook,
} from "lucide-react";

import type { User } from "@/lib/auth/types";
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
				icon: Home,
			},
		],
	},
	{
		title: "User Management",
		items: [
			{
				title: "All Users",
				url: "/users",
				icon: Users,
			},
			{
				title: "Deleted Users",
				url: "/users/deleted",
			},
			{
				title: "Permissions",
				url: "/users/permissions",
				icon: Shield,
			},
		],
	},
	{
		title: "Analytics",
		items: [
			{
				title: "Overview",
				url: "/analytics",
				icon: BarChart3,
			},
			{
				title: "User Activity",
				url: "/analytics/activity",
			},
			{
				title: "Performance",
				url: "/analytics/performance",
			},
		],
	},
	{
		title: "AI Lab",
		items: [
			{
				title: "Plan Testing",
				url: "/ai-lab",
				icon: Bot,
			},
			{
				title: "Model Config",
				url: "/ai-lab/models",
			},
		],
	},
	{
		title: "System",
		items: [
			{
				title: "Database",
				url: "/system/database",
				icon: Database,
			},
			{
				title: "Webhooks",
				url: "/system/webhooks",
				icon: Webhook,
			},
			{
				title: "Settings",
				url: "/settings",
				icon: Settings,
			},
		],
	},
];

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	user: User;
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
									<ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
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
