"use client";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@superset/ui/sidebar";
import { cn } from "@superset/ui/utils";
import { FolderGitIcon, LayersIcon, PlusIcon } from "lucide-react";

import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

export function SidebarAuditSection() {
	return (
		<ShowcaseSection
			id="sidebar-audit"
			index="04"
			title="Sidebar — zero adoption"
			description="0 files in apps/desktop/src import @superset/ui/sidebar. Its only real consumer is this showcase."
		>
			<ComponentCard
				title="1 · Canonical primitive"
				importPath="@superset/ui/sidebar"
				copyable={false}
				description="SidebarProvider + Sidebar (collapsible=&quot;none&quot;) — demoed on the Primitives page too."
				bleed
			>
				<SidebarProvider className="min-h-56 items-stretch">
					<Sidebar collapsible="none" className="border-r border-border">
						<SidebarHeader>
							<span className="px-2 text-xs font-medium text-sidebar-foreground">
								Workspace
							</span>
						</SidebarHeader>
						<SidebarContent>
							<SidebarGroup>
								<SidebarGroupLabel>Files</SidebarGroupLabel>
								<SidebarMenu>
									<SidebarMenuItem>
										<SidebarMenuButton isActive>
											<LayersIcon />
											<span>Workspaces</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								</SidebarMenu>
							</SidebarGroup>
						</SidebarContent>
						<SidebarFooter>
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton>
										<PlusIcon />
										<span>Add repository</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							</SidebarMenu>
						</SidebarFooter>
					</Sidebar>
				</SidebarProvider>
			</ComponentCard>

			<ComponentCard
				title="2 · Production reality — WorkspaceSidebar"
				importPath="renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebar.tsx:89"
				copyable={false}
				description="Root is <SidebarDropZone className=&quot;flex flex-col h-full bg-muted/45...&quot;> — a bespoke div, not <Sidebar>. Every row below is a hand-rolled <button>, not SidebarMenuButton."
				bleed
			>
				<div className="flex h-56 flex-col border border-border bg-muted/45 dark:bg-muted/35">
					<div className="flex flex-col border-b border-border px-2 pt-2 pb-2">
						<button
							type="button"
							className={cn(
								"flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
								"bg-fill-selected text-foreground",
							)}
						>
							<div className="flex size-5 items-center justify-center">
								<LayersIcon className="size-4" />
							</div>
							<span className="flex-1 text-left text-sm font-medium">
								Workspaces
							</span>
						</button>
					</div>
					<div className="flex-1" />
					<div className="flex items-center gap-2 border-t border-border p-2">
						<button
							type="button"
							className="flex min-w-0 flex-1 shrink items-center justify-start gap-2 text-sm text-muted-foreground hover:text-foreground"
						>
							<FolderGitIcon className="size-4 shrink-0" />
							<span className="truncate">Add repository</span>
						</button>
					</div>
				</div>
			</ComponentCard>
		</ShowcaseSection>
	);
}
