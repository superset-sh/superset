"use client";

import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	Menubar,
	MenubarContent,
	MenubarItem,
	MenubarMenu,
	MenubarSeparator,
	MenubarShortcut,
	MenubarTrigger,
} from "@superset/ui/menubar";
import { useState } from "react";

import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

export function MenusSection() {
	const [showDiff, setShowDiff] = useState(true);
	const [layout, setLayout] = useState("split");

	return (
		<ShowcaseSection
			id="menus"
			index="04"
			title={i18n._({ id: "web.design.menusSection.menus", message: "Menus" })}
			description={i18n._({
				id: "web.design.menusSection.dropdownContextAndApplicationMenus",
				message: "Dropdown, context, and application menus",
			})}
		>
			<ComponentCard
				title={i18n._({
					id: "web.design.menusSection.dropdownMenu",
					message: "Dropdown Menu",
				})}
				importPath="@superset/ui/dropdown-menu"
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline">
							<Trans id="web.design.menusSection.workspaceActions">
								Workspace actions
							</Trans>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-56">
						<DropdownMenuLabel>
							<Trans id="web.design.menusSection.componentShowcase">
								component-showcase
							</Trans>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem>
							<Trans id="web.design.menusSection.openInEditor">
								Open in editor
							</Trans>
							<DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
						</DropdownMenuItem>
						<DropdownMenuCheckboxItem
							checked={showDiff}
							onCheckedChange={setShowDiff}
						>
							<Trans id="web.design.menusSection.showDiffPanel">
								Show diff panel
							</Trans>
						</DropdownMenuCheckboxItem>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<Trans id="web.design.menusSection.layout">Layout</Trans>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<DropdownMenuRadioGroup
									value={layout}
									onValueChange={setLayout}
								>
									<DropdownMenuRadioItem value="split">
										<Trans id="web.design.menusSection.split">Split</Trans>
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="stacked">
										<Trans id="web.design.menusSection.stacked">Stacked</Trans>
									</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive">
							<Trans id="web.design.menusSection.deleteWorkspace">
								Delete workspace
							</Trans>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.menusSection.contextMenu",
					message: "Context Menu",
				})}
				importPath="@superset/ui/context-menu"
			>
				<ContextMenu>
					<ContextMenuTrigger className="flex h-28 w-full max-w-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
						<Trans id="web.design.menusSection.rightClickHere">
							Right-click here
						</Trans>
					</ContextMenuTrigger>
					<ContextMenuContent className="w-52">
						<ContextMenuItem>
							<Trans id="web.design.menusSection.copyPath">Copy path</Trans>
							<ContextMenuShortcut>⌘C</ContextMenuShortcut>
						</ContextMenuItem>
						<ContextMenuItem>
							<Trans id="web.design.menusSection.revealInFinder">
								Reveal in Finder
							</Trans>
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem variant="destructive">
							<Trans id="web.design.menusSection.discardChanges">
								Discard changes
							</Trans>
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.menusSection.menubar",
					message: "Menubar",
				})}
				importPath="@superset/ui/menubar"
				span
			>
				<Menubar>
					<MenubarMenu>
						<MenubarTrigger>
							<Trans id="web.design.menusSection.file">File</Trans>
						</MenubarTrigger>
						<MenubarContent>
							<MenubarItem>
								<Trans id="web.design.menusSection.newWorkspace">
									New workspace
								</Trans>{" "}
								<MenubarShortcut>⌘N</MenubarShortcut>
							</MenubarItem>
							<MenubarItem>
								<Trans id="web.design.menusSection.openRecent">
									Open recent
								</Trans>
							</MenubarItem>
							<MenubarSeparator />
							<MenubarItem>
								<Trans id="web.design.menusSection.close">Close</Trans>
							</MenubarItem>
						</MenubarContent>
					</MenubarMenu>
					<MenubarMenu>
						<MenubarTrigger>
							<Trans id="web.design.menusSection.edit">Edit</Trans>
						</MenubarTrigger>
						<MenubarContent>
							<MenubarItem>
								<Trans id="web.design.menusSection.undo">Undo</Trans>{" "}
								<MenubarShortcut>⌘Z</MenubarShortcut>
							</MenubarItem>
							<MenubarItem>
								<Trans id="web.design.menusSection.redo">Redo</Trans>{" "}
								<MenubarShortcut>⇧⌘Z</MenubarShortcut>
							</MenubarItem>
						</MenubarContent>
					</MenubarMenu>
					<MenubarMenu>
						<MenubarTrigger>
							<Trans id="web.design.menusSection.view">View</Trans>
						</MenubarTrigger>
						<MenubarContent>
							<MenubarItem>
								<Trans id="web.design.menusSection.toggleSidebar">
									Toggle sidebar
								</Trans>
							</MenubarItem>
							<MenubarItem>
								<Trans id="web.design.menusSection.zoomIn">Zoom in</Trans>
							</MenubarItem>
						</MenubarContent>
					</MenubarMenu>
				</Menubar>
			</ComponentCard>
		</ShowcaseSection>
	);
}
