"use client";

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
					<ContextMenuContent className="w-52">
						<ContextMenuItem>
							Copy path
							<ContextMenuShortcut>⌘C</ContextMenuShortcut>
						</ContextMenuItem>
						<ContextMenuItem>Reveal in Finder</ContextMenuItem>
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
							<MenubarItem>
								New workspace <MenubarShortcut>⌘N</MenubarShortcut>
							</MenubarItem>
							<MenubarItem>Open recent</MenubarItem>
							<MenubarSeparator />
							<MenubarItem>Close</MenubarItem>
						</MenubarContent>
					</MenubarMenu>
					<MenubarMenu>
						<MenubarTrigger>Edit</MenubarTrigger>
						<MenubarContent>
							<MenubarItem>
								Undo <MenubarShortcut>⌘Z</MenubarShortcut>
							</MenubarItem>
							<MenubarItem>
								Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut>
							</MenubarItem>
						</MenubarContent>
					</MenubarMenu>
					<MenubarMenu>
						<MenubarTrigger>View</MenubarTrigger>
						<MenubarContent>
							<MenubarItem>Toggle sidebar</MenubarItem>
							<MenubarItem>Zoom in</MenubarItem>
						</MenubarContent>
					</MenubarMenu>
				</Menubar>
			</ComponentCard>
		</ShowcaseSection>
	);
}
