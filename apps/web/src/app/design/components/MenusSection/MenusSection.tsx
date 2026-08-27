"use client";

import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
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
	MenubarCheckboxItem,
	MenubarContent,
	MenubarGroup,
	MenubarItem,
	MenubarLabel,
	MenubarMenu,
	MenubarRadioGroup,
	MenubarRadioItem,
	MenubarSeparator,
	MenubarShortcut,
	MenubarSub,
	MenubarSubContent,
	MenubarSubTrigger,
	MenubarTrigger,
} from "@superset/ui/menubar";
import { ArrowRightLeft, FolderPlus } from "lucide-react";
import { useState } from "react";

import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

export function MenusSection() {
	const [showDiff, setShowDiff] = useState(true);
	const [layout, setLayout] = useState("split");
	const [trackChanges, setTrackChanges] = useState(true);
	const [sortBy, setSortBy] = useState("name");
	const [showSidebar, setShowSidebar] = useState(true);
	const [menubarLayout, setMenubarLayout] = useState("split");

	return (
		<ShowcaseSection
			id="menus"
			index="04"
			title="Menus"
			description="Dropdown, context, and application menus"
		>
			<ComponentCard
				title="Dropdown Menu"
				importPath="@superset/ui/dropdown-menu"
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline">Workspace actions</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-56">
						<DropdownMenuLabel>component-showcase</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem>
							Open in editor
							<DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
						</DropdownMenuItem>
						<DropdownMenuCheckboxItem
							checked={showDiff}
							onCheckedChange={setShowDiff}
						>
							Show diff panel
						</DropdownMenuCheckboxItem>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>Layout</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<DropdownMenuRadioGroup
									value={layout}
									onValueChange={setLayout}
								>
									<DropdownMenuRadioItem value="split">
										Split
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="stacked">
										Stacked
									</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive">
							Delete workspace
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</ComponentCard>

			<ComponentCard
				title="Context Menu"
				importPath="@superset/ui/context-menu"
			>
				<ContextMenu>
					<ContextMenuTrigger className="flex h-28 w-full max-w-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
						Right-click here
					</ContextMenuTrigger>
					<ContextMenuContent className="w-56">
						<ContextMenuLabel>component-showcase</ContextMenuLabel>
						<ContextMenuGroup>
							<ContextMenuItem>
								Copy path
								<ContextMenuShortcut>⌘C</ContextMenuShortcut>
							</ContextMenuItem>
							<ContextMenuItem>Reveal in Finder</ContextMenuItem>
						</ContextMenuGroup>
						<ContextMenuSeparator />
						<ContextMenuCheckboxItem
							checked={trackChanges}
							onCheckedChange={setTrackChanges}
						>
							Track changes
						</ContextMenuCheckboxItem>
						<ContextMenuSeparator />
						<ContextMenuRadioGroup value={sortBy} onValueChange={setSortBy}>
							<ContextMenuRadioItem value="name">
								Sort by name
							</ContextMenuRadioItem>
							<ContextMenuRadioItem value="modified">
								Sort by modified
							</ContextMenuRadioItem>
						</ContextMenuRadioGroup>
						<ContextMenuSeparator />
						<ContextMenuSub>
							<ContextMenuSubTrigger>
								<ArrowRightLeft />
								Move to Section
							</ContextMenuSubTrigger>
							<ContextMenuSubContent>
								<ContextMenuItem>
									<FolderPlus />
									New Section
								</ContextMenuItem>
								<ContextMenuSeparator />
								<ContextMenuItem>Ungrouped</ContextMenuItem>
							</ContextMenuSubContent>
						</ContextMenuSub>
						<ContextMenuSeparator />
						<ContextMenuItem variant="destructive">
							Discard changes
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			</ComponentCard>

			<ComponentCard title="Menubar" importPath="@superset/ui/menubar" span>
				<Menubar>
					<MenubarMenu>
						<MenubarTrigger>File</MenubarTrigger>
						<MenubarContent>
							<MenubarGroup>
								<MenubarItem>
									New workspace <MenubarShortcut>⌘N</MenubarShortcut>
								</MenubarItem>
								<MenubarSub>
									<MenubarSubTrigger>Open recent</MenubarSubTrigger>
									<MenubarSubContent>
										<MenubarItem>component-showcase</MenubarItem>
										<MenubarItem>design-system-audit</MenubarItem>
									</MenubarSubContent>
								</MenubarSub>
							</MenubarGroup>
							<MenubarSeparator />
							<MenubarItem>Close</MenubarItem>
						</MenubarContent>
					</MenubarMenu>
					<MenubarMenu>
						<MenubarTrigger>Edit</MenubarTrigger>
						<MenubarContent>
							<MenubarGroup>
								<MenubarItem>
									Undo <MenubarShortcut>⌘Z</MenubarShortcut>
								</MenubarItem>
								<MenubarItem>
									Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut>
								</MenubarItem>
							</MenubarGroup>
						</MenubarContent>
					</MenubarMenu>
					<MenubarMenu>
						<MenubarTrigger>View</MenubarTrigger>
						<MenubarContent>
							<MenubarCheckboxItem
								checked={showSidebar}
								onCheckedChange={setShowSidebar}
							>
								Toggle sidebar
							</MenubarCheckboxItem>
							<MenubarItem>Zoom in</MenubarItem>
							<MenubarSeparator />
							<MenubarLabel>Layout</MenubarLabel>
							<MenubarRadioGroup
								value={menubarLayout}
								onValueChange={setMenubarLayout}
							>
								<MenubarRadioItem value="split">Split</MenubarRadioItem>
								<MenubarRadioItem value="stacked">Stacked</MenubarRadioItem>
							</MenubarRadioGroup>
						</MenubarContent>
					</MenubarMenu>
				</Menubar>
			</ComponentCard>
		</ShowcaseSection>
	);
}
