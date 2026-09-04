"use client";

import { msg } from "@lingui/core/macro";
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
			title={i18n._(
				msg({
					message: "Overlays",
				}),
			)}
			description={i18n._(
				msg({
					message: "Dialogs, sheets, popovers, and hover surfaces",
				}),
			)}
		>
			<ComponentCard
				title={i18n._(
					msg({
						message: "Dialog",
					}),
				)}
				importPath="@superset/ui/dialog"
			>
				<Dialog>
					<DialogTrigger asChild>
						<Button variant="outline">
							<Trans>Open dialog</Trans>
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle>
								<Trans>Rename workspace</Trans>
							</DialogTitle>
							<DialogDescription>
								<Trans>
									This only changes the display name, not the branch.
								</Trans>
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							<Label htmlFor="dsg-rename">
								<Trans>Name</Trans>
							</Label>
							<Input id="dsg-rename" defaultValue="component-showcase" />
						</div>
						<DialogFooter>
							<DialogClose asChild>
								<Button variant="ghost">
									<Trans>Cancel</Trans>
								</Button>
							</DialogClose>
							<Button>
								<Trans>Save</Trans>
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Alert Dialog",
					}),
				)}
				importPath="@superset/ui/alert-dialog"
			>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="destructive">
							<Trans>Delete workspace</Trans>
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								<Trans>Delete this workspace?</Trans>
							</AlertDialogTitle>
							<AlertDialogDescription>
								<Trans>
									The worktree and any uncommitted changes will be removed. This
									cannot be undone.
								</Trans>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>
								<Trans>Cancel</Trans>
							</AlertDialogCancel>
							<AlertDialogAction>
								<Trans>Delete</Trans>
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Sheet",
					}),
				)}
				importPath="@superset/ui/sheet"
			>
				<Sheet>
					<SheetTrigger asChild>
						<Button variant="outline">
							<Trans>Open sheet</Trans>
						</Button>
					</SheetTrigger>
					<SheetContent>
						<SheetHeader>
							<SheetTitle>
								<Trans>Workspace settings</Trans>
							</SheetTitle>
							<SheetDescription>
								<Trans>Slides in from the edge of the viewport.</Trans>
							</SheetDescription>
						</SheetHeader>
					</SheetContent>
				</Sheet>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Drawer",
					}),
				)}
				importPath="@superset/ui/drawer"
			>
				<Drawer>
					<DrawerTrigger asChild>
						<Button variant="outline">
							<Trans>Open drawer</Trans>
						</Button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>
								<Trans>Session details</Trans>
							</DrawerTitle>
							<DrawerDescription>
								<Trans>Bottom drawer, swipe-friendly on touch devices.</Trans>
							</DrawerDescription>
						</DrawerHeader>
						<DrawerFooter>
							<DrawerClose asChild>
								<Button variant="outline">
									<Trans>Close</Trans>
								</Button>
							</DrawerClose>
						</DrawerFooter>
					</DrawerContent>
				</Drawer>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Popover",
					}),
				)}
				importPath="@superset/ui/popover"
			>
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline">
							<SettingsIcon />
							<Trans>Preferences</Trans>
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-64 space-y-2">
						<p className="text-sm font-medium">
							<Trans>Terminal font size</Trans>
						</p>
						<Input type="number" defaultValue={13} />
					</PopoverContent>
				</Popover>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Hover Card",
					}),
				)}
				importPath="@superset/ui/hover-card"
			>
				<HoverCard>
					<HoverCardTrigger asChild>
						<Button variant="link">
							<Trans>@superset</Trans>
						</Button>
					</HoverCardTrigger>
					<HoverCardContent className="w-72">
						<div className="flex gap-3">
							<RocketIcon className="mt-1 size-4 shrink-0" />
							<div className="space-y-1">
								<p className="text-sm font-medium">
									<Trans>Superset</Trans>
								</p>
								<p className="text-sm text-muted-foreground">
									<Trans>Run 10+ parallel coding agents on your machine.</Trans>
								</p>
								<div className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
									<CalendarIcon className="size-3" /> <Trans>Since 2025</Trans>
								</div>
							</div>
						</div>
					</HoverCardContent>
				</HoverCard>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Tooltip",
					}),
				)}
				importPath="@superset/ui/tooltip"
				description={i18n._(
					msg({
						message:
							"Bordered chip is the default (the preset/HotkeyTooltip style); arrow is opt-in via showArrow",
					}),
				)}
			>
				{(["top", "right", "bottom", "left"] as const).map((side) => (
					<Tooltip key={side}>
						<TooltipTrigger asChild>
							<Button variant="outline" size="sm">
								{side}
							</Button>
						</TooltipTrigger>
						<TooltipContent side={side}>
							<Trans>Tooltip on</Trans> {side}
						</TooltipContent>
					</Tooltip>
				))}
				<Tooltip delayDuration={1000}>
					<TooltipTrigger asChild>
						<Button variant="outline" size="sm">
							<Trans>Hotkey chip</Trans>
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
							<Trans>With arrow</Trans>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow>
						<Trans>showArrow opt-in</Trans>
					</TooltipContent>
				</Tooltip>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Command",
					}),
				)}
				importPath="@superset/ui/command"
				description={i18n._(
					msg({
						message: "Also available as CommandDialog for ⌘K palettes",
					}),
				)}
				span
				bleed
			>
				<Command className="max-h-64 rounded-none border-0">
					<CommandInput
						placeholder={i18n._(
							msg({
								message: "Type a command or search…",
							}),
						)}
					/>
					<CommandList>
						<CommandEmpty>
							<Trans>No results found.</Trans>
						</CommandEmpty>
						<CommandGroup heading="Workspaces">
							<CommandItem>
								<RocketIcon />
								<Trans>New workspace</Trans>
								<CommandShortcut>⌘N</CommandShortcut>
							</CommandItem>
							<CommandItem>
								<UserIcon />
								<Trans>Invite teammate</Trans>
							</CommandItem>
						</CommandGroup>
						<CommandSeparator />
						<CommandGroup heading="Settings">
							<CommandItem>
								<SettingsIcon />
								<Trans>Open settings</Trans>
								<CommandShortcut>⌘,</CommandShortcut>
							</CommandItem>
						</CommandGroup>
					</CommandList>
				</Command>
			</ComponentCard>
		</ShowcaseSection>
	);
}
