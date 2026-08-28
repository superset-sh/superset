"use client";

import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
	CommandShortcut,
} from "@superset/ui/command";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@superset/ui/dialog";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@superset/ui/drawer";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { Input } from "@superset/ui/input";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@superset/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { CalendarIcon, RocketIcon, SettingsIcon, UserIcon } from "lucide-react";

import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

export function OverlaysSection() {
	return (
		<ShowcaseSection
			id="overlays"
			index="03"
			title={i18n._({
				id: "web.design.overlaysSection.overlays",
				message: "Overlays",
			})}
			description={i18n._({
				id: "web.design.overlaysSection.dialogsSheetsPopoversAndHover",
				message: "Dialogs, sheets, popovers, and hover surfaces",
			})}
		>
			<ComponentCard
				title={i18n._({
					id: "web.design.overlaysSection.dialog",
					message: "Dialog",
				})}
				importPath="@superset/ui/dialog"
			>
				<Dialog>
					<DialogTrigger asChild>
						<Button variant="outline">
							<Trans id="web.design.overlaysSection.openDialog">
								Open dialog
							</Trans>
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle>
								<Trans id="web.design.overlaysSection.renameWorkspace">
									Rename workspace
								</Trans>
							</DialogTitle>
							<DialogDescription>
								<Trans id="web.design.overlaysSection.thisOnlyChangesTheDisplay">
									This only changes the display name, not the branch.
								</Trans>
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							<Label htmlFor="dsg-rename">
								<Trans id="web.design.overlaysSection.name">Name</Trans>
							</Label>
							<Input id="dsg-rename" defaultValue="component-showcase" />
						</div>
						<DialogFooter>
							<DialogClose asChild>
								<Button variant="ghost">
									<Trans id="web.design.overlaysSection.cancel">Cancel</Trans>
								</Button>
							</DialogClose>
							<Button>
								<Trans id="web.design.overlaysSection.save">Save</Trans>
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.overlaysSection.alertDialog",
					message: "Alert Dialog",
				})}
				importPath="@superset/ui/alert-dialog"
			>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="destructive">
							<Trans id="web.design.overlaysSection.deleteWorkspace">
								Delete workspace
							</Trans>
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								<Trans id="web.design.overlaysSection.deleteThisWorkspace">
									Delete this workspace?
								</Trans>
							</AlertDialogTitle>
							<AlertDialogDescription>
								<Trans id="web.design.overlaysSection.theWorktreeAndAnyUncommitted">
									The worktree and any uncommitted changes will be removed. This
									cannot be undone.
								</Trans>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>
								<Trans id="web.design.overlaysSection.cancel">Cancel</Trans>
							</AlertDialogCancel>
							<AlertDialogAction>
								<Trans id="web.design.overlaysSection.delete">Delete</Trans>
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.overlaysSection.sheet",
					message: "Sheet",
				})}
				importPath="@superset/ui/sheet"
			>
				<Sheet>
					<SheetTrigger asChild>
						<Button variant="outline">
							<Trans id="web.design.overlaysSection.openSheet">
								Open sheet
							</Trans>
						</Button>
					</SheetTrigger>
					<SheetContent>
						<SheetHeader>
							<SheetTitle>
								<Trans id="web.design.overlaysSection.workspaceSettings">
									Workspace settings
								</Trans>
							</SheetTitle>
							<SheetDescription>
								<Trans id="web.design.overlaysSection.slidesInFromTheEdge">
									Slides in from the edge of the viewport.
								</Trans>
							</SheetDescription>
						</SheetHeader>
					</SheetContent>
				</Sheet>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.overlaysSection.drawer",
					message: "Drawer",
				})}
				importPath="@superset/ui/drawer"
			>
				<Drawer>
					<DrawerTrigger asChild>
						<Button variant="outline">
							<Trans id="web.design.overlaysSection.openDrawer">
								Open drawer
							</Trans>
						</Button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>
								<Trans id="web.design.overlaysSection.sessionDetails">
									Session details
								</Trans>
							</DrawerTitle>
							<DrawerDescription>
								<Trans id="web.design.overlaysSection.bottomDrawerSwipeFriendlyOn">
									Bottom drawer, swipe-friendly on touch devices.
								</Trans>
							</DrawerDescription>
						</DrawerHeader>
						<DrawerFooter>
							<DrawerClose asChild>
								<Button variant="outline">
									<Trans id="web.design.overlaysSection.close">Close</Trans>
								</Button>
							</DrawerClose>
						</DrawerFooter>
					</DrawerContent>
				</Drawer>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.overlaysSection.popover",
					message: "Popover",
				})}
				importPath="@superset/ui/popover"
			>
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline">
							<SettingsIcon />
							<Trans id="web.design.overlaysSection.preferences">
								Preferences
							</Trans>
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-64 space-y-2">
						<p className="text-sm font-medium">
							<Trans id="web.design.overlaysSection.terminalFontSize">
								Terminal font size
							</Trans>
						</p>
						<Input type="number" defaultValue={13} />
					</PopoverContent>
				</Popover>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.overlaysSection.hoverCard",
					message: "Hover Card",
				})}
				importPath="@superset/ui/hover-card"
			>
				<HoverCard>
					<HoverCardTrigger asChild>
						<Button variant="link">
							<Trans id="web.design.overlaysSection.superset">@superset</Trans>
						</Button>
					</HoverCardTrigger>
					<HoverCardContent className="w-72">
						<div className="flex gap-3">
							<RocketIcon className="mt-1 size-4 shrink-0" />
							<div className="space-y-1">
								<p className="text-sm font-medium">
									<Trans id="web.design.overlaysSection.superset2">
										Superset
									</Trans>
								</p>
								<p className="text-sm text-muted-foreground">
									<Trans id="web.design.overlaysSection.run10ParallelCodingAgents">
										Run 10+ parallel coding agents on your machine.
									</Trans>
								</p>
								<div className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
									<CalendarIcon className="size-3" />{" "}
									<Trans id="web.design.overlaysSection.since2025">
										Since 2025
									</Trans>
								</div>
							</div>
						</div>
					</HoverCardContent>
				</HoverCard>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.overlaysSection.tooltip",
					message: "Tooltip",
				})}
				importPath="@superset/ui/tooltip"
				description={i18n._({
					id: "web.design.overlaysSection.borderedChipIsTheDefault",
					message:
						"Bordered chip is the default (the preset/HotkeyTooltip style); arrow is opt-in via showArrow",
				})}
			>
				{(["top", "right", "bottom", "left"] as const).map((side) => (
					<Tooltip key={side}>
						<TooltipTrigger asChild>
							<Button variant="outline" size="sm">
								{side}
							</Button>
						</TooltipTrigger>
						<TooltipContent side={side}>
							<Trans id="web.design.overlaysSection.tooltipOn">
								Tooltip on
							</Trans>{" "}
							{side}
						</TooltipContent>
					</Tooltip>
				))}
				<Tooltip delayDuration={1000}>
					<TooltipTrigger asChild>
						<Button variant="outline" size="sm">
							<Trans id="web.design.overlaysSection.hotkeyChip">
								Hotkey chip
							</Trans>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<KbdGroup>
							<Kbd>⌘</Kbd>
							<Kbd>⇧</Kbd>
							<Kbd>O</Kbd>
						</KbdGroup>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="outline" size="sm">
							<Trans id="web.design.overlaysSection.withArrow">
								With arrow
							</Trans>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow>
						<Trans id="web.design.overlaysSection.showarrowOptIn">
							showArrow opt-in
						</Trans>
					</TooltipContent>
				</Tooltip>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.overlaysSection.command",
					message: "Command",
				})}
				importPath="@superset/ui/command"
				description={i18n._({
					id: "web.design.overlaysSection.alsoAvailableAsCommanddialogFor",
					message: "Also available as CommandDialog for ⌘K palettes",
				})}
				span
				bleed
			>
				<Command className="max-h-64 rounded-none border-0">
					<CommandInput
						placeholder={i18n._({
							id: "web.design.overlaysSection.typeACommandOrSearch",
							message: "Type a command or search…",
						})}
					/>
					<CommandList>
						<CommandEmpty>
							<Trans id="web.design.overlaysSection.noResultsFound">
								No results found.
							</Trans>
						</CommandEmpty>
						<CommandGroup heading="Workspaces">
							<CommandItem>
								<RocketIcon />
								<Trans id="web.design.overlaysSection.newWorkspace">
									New workspace
								</Trans>
								<CommandShortcut>⌘N</CommandShortcut>
							</CommandItem>
							<CommandItem>
								<UserIcon />
								<Trans id="web.design.overlaysSection.inviteTeammate">
									Invite teammate
								</Trans>
							</CommandItem>
						</CommandGroup>
						<CommandSeparator />
						<CommandGroup heading="Settings">
							<CommandItem>
								<SettingsIcon />
								<Trans id="web.design.overlaysSection.openSettings">
									Open settings
								</Trans>
								<CommandShortcut>⌘,</CommandShortcut>
							</CommandItem>
						</CommandGroup>
					</CommandList>
				</Command>
			</ComponentCard>
		</ShowcaseSection>
	);
}
