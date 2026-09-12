"use client";

import { msg } from "@lingui/core/macro";
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
			title={i18n._(msg({ message: "Menus" }))}
			description={i18n._(
				msg({
					message: "Dropdown, context, and application menus",
				}),
			)}
		>
			<ComponentCard
				title={i18n._(
					msg({
						message: "Dropdown Menu",
					}),
				)}
				importPath="@superset/ui/dropdown-menu"
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline">
							<Trans>Workspace actions</Trans>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-56">
						<DropdownMenuLabel>
							<Trans>component-showcase</Trans>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem>
							<Trans>Open in editor</Trans>
							<DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
						</DropdownMenuItem>
						<DropdownMenuCheckboxItem
							checked={showDiff}
							onCheckedChange={setShowDiff}
						>
							<Trans>Show diff panel</Trans>
						</DropdownMenuCheckboxItem>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<Trans>Layout</Trans>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<DropdownMenuRadioGroup
									value={layout}
									onValueChange={setLayout}
								>
									<DropdownMenuRadioItem value="split">
										<Trans>Split</Trans>
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="stacked">
										<Trans>Stacked</Trans>
									</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive">
							<Trans>Delete workspace</Trans>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Context Menu",
					}),
				)}
				importPath="@superset/ui/context-menu"
			>
				<ContextMenu>
					<ContextMenuTrigger className="flex h-28 w-full max-w-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
						<Trans>Right-click here</Trans>
					</ContextMenuTrigger>
					<ContextMenuContent className="w-52">
						<ContextMenuItem>
							<Trans>Copy path</Trans>
							<ContextMenuShortcut>⌘C</ContextMenuShortcut>
						</ContextMenuItem>
						<ContextMenuItem>
							<Trans>Reveal in Finder</Trans>
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem variant="destructive">
							<Trans>Discard changes</Trans>
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Menubar",
					}),
				)}
				importPath="@superset/ui/menubar"
				span
			>
				<Menubar>
					<MenubarMenu>
						<MenubarTrigger>
							<Trans>File</Trans>
						</MenubarTrigger>
						<MenubarContent>
							<MenubarItem>
								<Trans>New workspace</Trans>{" "}
								<MenubarShortcut>⌘N</MenubarShortcut>
							</MenubarItem>
							<MenubarItem>
								<Trans>Open recent</Trans>
							</MenubarItem>
							<MenubarSeparator />
							<MenubarItem>
								<Trans>Close</Trans>
							</MenubarItem>
						</MenubarContent>
					</MenubarMenu>
					<MenubarMenu>
						<MenubarTrigger>
							<Trans>Edit</Trans>
						</MenubarTrigger>
						<MenubarContent>
							<MenubarItem>
								<Trans>Undo</Trans> <MenubarShortcut>⌘Z</MenubarShortcut>
							</MenubarItem>
							<MenubarItem>
								<Trans>Redo</Trans> <MenubarShortcut>⇧⌘Z</MenubarShortcut>
							</MenubarItem>
						</MenubarContent>
					</MenubarMenu>
					<MenubarMenu>
						<MenubarTrigger>
							<Trans context="menu">View</Trans>
						</MenubarTrigger>
						<MenubarContent>
							<MenubarItem>
								<Trans>Toggle sidebar</Trans>
							</MenubarItem>
							<MenubarItem>
								<Trans>Zoom in</Trans>
							</MenubarItem>
						</MenubarContent>
					</MenubarMenu>
				</Menubar>
			</ComponentCard>
		</ShowcaseSection>
	);
}
