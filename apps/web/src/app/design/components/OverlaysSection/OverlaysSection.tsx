"use client";

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
			title="Overlays"
			description="Dialogs, sheets, popovers, and hover surfaces"
		>
			<ComponentCard title="Dialog" importPath="@superset/ui/dialog">
				<Dialog>
					<DialogTrigger asChild>
						<Button variant="outline">Open dialog</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle>Rename workspace</DialogTitle>
							<DialogDescription>
								This only changes the display name, not the branch.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							<Label htmlFor="dsg-rename">Name</Label>
							<Input id="dsg-rename" defaultValue="component-showcase" />
						</div>
						<DialogFooter>
							<DialogClose asChild>
								<Button variant="ghost">Cancel</Button>
							</DialogClose>
							<Button>Save</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</ComponentCard>

			<ComponentCard
				title="Alert Dialog"
				importPath="@superset/ui/alert-dialog"
			>
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="destructive">Delete workspace</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
							<AlertDialogDescription>
								The worktree and any uncommitted changes will be removed. This
								cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction>Delete</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</ComponentCard>

			<ComponentCard title="Sheet" importPath="@superset/ui/sheet">
				<Sheet>
					<SheetTrigger asChild>
						<Button variant="outline">Open sheet</Button>
					</SheetTrigger>
					<SheetContent>
						<SheetHeader>
							<SheetTitle>Workspace settings</SheetTitle>
							<SheetDescription>
								Slides in from the edge of the viewport.
							</SheetDescription>
						</SheetHeader>
					</SheetContent>
				</Sheet>
			</ComponentCard>

			<ComponentCard title="Drawer" importPath="@superset/ui/drawer">
				<Drawer>
					<DrawerTrigger asChild>
						<Button variant="outline">Open drawer</Button>
					</DrawerTrigger>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>Session details</DrawerTitle>
							<DrawerDescription>
								Bottom drawer, swipe-friendly on touch devices.
							</DrawerDescription>
						</DrawerHeader>
						<DrawerFooter>
							<DrawerClose asChild>
								<Button variant="outline">Close</Button>
							</DrawerClose>
						</DrawerFooter>
					</DrawerContent>
				</Drawer>
			</ComponentCard>

			<ComponentCard title="Popover" importPath="@superset/ui/popover">
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline">
							<SettingsIcon />
							Preferences
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-64 space-y-2">
						<p className="text-sm font-medium">Terminal font size</p>
						<Input type="number" defaultValue={13} />
					</PopoverContent>
				</Popover>
			</ComponentCard>

			<ComponentCard title="Hover Card" importPath="@superset/ui/hover-card">
				<HoverCard>
					<HoverCardTrigger asChild>
						<Button variant="link">@superset</Button>
					</HoverCardTrigger>
					<HoverCardContent className="w-72">
						<div className="flex gap-3">
							<RocketIcon className="mt-1 size-4 shrink-0" />
							<div className="space-y-1">
								<p className="text-sm font-medium">Superset</p>
								<p className="text-sm text-muted-foreground">
									Run 10+ parallel coding agents on your machine.
								</p>
								<div className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
									<CalendarIcon className="size-3" /> Since 2025
								</div>
							</div>
						</div>
					</HoverCardContent>
				</HoverCard>
			</ComponentCard>

			<ComponentCard
				title="Tooltip"
				importPath="@superset/ui/tooltip"
				description="Bordered chip is the default (the preset/HotkeyTooltip style); arrow is opt-in via showArrow"
			>
				{(["top", "right", "bottom", "left"] as const).map((side) => (
					<Tooltip key={side}>
						<TooltipTrigger asChild>
							<Button variant="outline" size="sm">
								{side}
							</Button>
						</TooltipTrigger>
						<TooltipContent side={side}>Tooltip on {side}</TooltipContent>
					</Tooltip>
				))}
				<Tooltip delayDuration={1000}>
					<TooltipTrigger asChild>
						<Button variant="outline" size="sm">
							Hotkey chip
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
							With arrow
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow>
						showArrow opt-in
					</TooltipContent>
				</Tooltip>
			</ComponentCard>

			<ComponentCard
				title="Command"
				importPath="@superset/ui/command"
				description="Also available as CommandDialog for ⌘K palettes"
				span
				bleed
			>
				<Command className="max-h-64 rounded-none border-0">
					<CommandInput placeholder="Type a command or search…" />
					<CommandList>
						<CommandEmpty>No results found.</CommandEmpty>
						<CommandGroup heading="Workspaces">
							<CommandItem>
								<RocketIcon />
								New workspace
								<CommandShortcut>⌘N</CommandShortcut>
							</CommandItem>
							<CommandItem>
								<UserIcon />
								Invite teammate
							</CommandItem>
						</CommandGroup>
						<CommandSeparator />
						<CommandGroup heading="Settings">
							<CommandItem>
								<SettingsIcon />
								Open settings
								<CommandShortcut>⌘,</CommandShortcut>
							</CommandItem>
						</CommandGroup>
					</CommandList>
				</Command>
			</ComponentCard>
		</ShowcaseSection>
	);
}
