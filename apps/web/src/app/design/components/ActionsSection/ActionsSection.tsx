"use client";

import { Button } from "@superset/ui/button";
import {
	ButtonGroup,
	ButtonGroupSeparator,
	ButtonGroupText,
} from "@superset/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Spinner } from "@superset/ui/spinner";
import { Toggle } from "@superset/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import {
	ArchiveIcon,
	BoldIcon,
	ChevronDownIcon,
	ChevronsUpDownIcon,
	CodeIcon,
	FolderGitIcon,
	ItalicIcon,
	PlusIcon,
	TrashIcon,
	UnderlineIcon,
} from "lucide-react";

import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

export function ActionsSection() {
	return (
		<ShowcaseSection
			id="actions"
			index="01"
			title="Actions"
			description="Buttons, toggles, and keyboard affordances"
		>
			<ComponentCard
				title="Button — variants"
				importPath="@superset/ui/button"
				description="default · secondary · outline · ghost · link · destructive"
				span
			>
				<Button>Default</Button>
				<Button variant="secondary">Secondary</Button>
				<Button variant="outline">Outline</Button>
				<Button variant="ghost">Ghost</Button>
				<Button variant="link">Link</Button>
				<Button variant="destructive">Destructive</Button>
			</ComponentCard>

			<ComponentCard
				title="Button — sizes"
				importPath="@superset/ui/button"
				description="xs · sm · default · lg · icon-xs → icon-lg"
				span
			>
				<Button size="xs" variant="outline">
					Extra small
				</Button>
				<Button size="sm" variant="outline">
					Small
				</Button>
				<Button variant="outline">Default</Button>
				<Button size="lg" variant="outline">
					Large
				</Button>
				<Button size="icon-xs" variant="outline" aria-label="Add">
					<PlusIcon />
				</Button>
				<Button size="icon-sm" variant="outline" aria-label="Add">
					<PlusIcon />
				</Button>
				<Button size="icon" variant="outline" aria-label="Add">
					<PlusIcon />
				</Button>
				<Button size="icon-lg" variant="outline" aria-label="Add">
					<PlusIcon />
				</Button>
			</ComponentCard>

			<ComponentCard title="Button — states" importPath="@superset/ui/button">
				<Button disabled>Disabled</Button>
				<Button disabled>
					<Spinner />
					Saving…
				</Button>
				<Button variant="outline">
					<ArchiveIcon />
					With icon
				</Button>
			</ComponentCard>

			<ComponentCard
				title="Button Group"
				importPath="@superset/ui/button-group"
			>
				<ButtonGroup>
					<Button variant="outline">Archive</Button>
					<Button variant="outline">Snooze</Button>
					<ButtonGroupSeparator />
					<Button variant="outline" size="icon" aria-label="Delete">
						<TrashIcon />
					</Button>
				</ButtonGroup>
				<ButtonGroup>
					<ButtonGroupText>https://</ButtonGroupText>
					<Button variant="outline">superset.sh</Button>
					<Button variant="outline" size="icon" aria-label="Expand">
						<ChevronDownIcon />
					</Button>
				</ButtonGroup>
			</ComponentCard>

			<ComponentCard title="Toggle" importPath="@superset/ui/toggle">
				<Toggle aria-label="Toggle bold">
					<BoldIcon />
				</Toggle>
				<Toggle variant="outline" aria-label="Toggle italic">
					<ItalicIcon />
				</Toggle>
				<Toggle variant="outline">
					<UnderlineIcon />
					With label
				</Toggle>
				<Toggle disabled aria-label="Disabled toggle">
					Disabled
				</Toggle>
			</ComponentCard>

			<ComponentCard
				title="Toggle Group"
				importPath="@superset/ui/toggle-group"
			>
				<ToggleGroup type="multiple" variant="outline">
					<ToggleGroupItem value="bold" aria-label="Bold">
						<BoldIcon />
					</ToggleGroupItem>
					<ToggleGroupItem value="italic" aria-label="Italic">
						<ItalicIcon />
					</ToggleGroupItem>
					<ToggleGroupItem value="underline" aria-label="Underline">
						<UnderlineIcon />
					</ToggleGroupItem>
				</ToggleGroup>
				<ToggleGroup type="single" defaultValue="week">
					<ToggleGroupItem value="day">Day</ToggleGroupItem>
					<ToggleGroupItem value="week">Week</ToggleGroupItem>
					<ToggleGroupItem value="month">Month</ToggleGroupItem>
				</ToggleGroup>
			</ComponentCard>

			<ComponentCard
				title="Button patterns (in product)"
				importPath="@superset/ui/button"
				description="Split button mirrors desktop's OpenInButton; picker trigger mirrors PickerTrigger"
				span
			>
				<ButtonGroup>
					<Button variant="outline" size="sm">
						<CodeIcon />
						Open in Cursor
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="icon-sm" aria-label="Choose app">
								<ChevronDownIcon />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem>Cursor</DropdownMenuItem>
							<DropdownMenuItem>VS Code</DropdownMenuItem>
							<DropdownMenuItem>Terminal</DropdownMenuItem>
							<DropdownMenuItem>Copy path</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</ButtonGroup>
				<Button
					variant="ghost"
					className="max-w-48 justify-between gap-1 px-2 text-xs"
				>
					<span className="flex min-w-0 flex-1 items-center gap-1.5">
						<FolderGitIcon className="size-3.5 shrink-0" />
						<span className="truncate text-left">component-showcase</span>
					</span>
					<ChevronsUpDownIcon className="size-3 shrink-0" />
				</Button>
			</ComponentCard>

			<ComponentCard title="Kbd" importPath="@superset/ui/kbd" span>
				<KbdGroup>
					<Kbd>⌘</Kbd>
					<Kbd>K</Kbd>
				</KbdGroup>
				<KbdGroup>
					<Kbd>⌘</Kbd>
					<Kbd>⇧</Kbd>
					<Kbd>P</Kbd>
				</KbdGroup>
				<span className="text-sm text-muted-foreground">
					Press <Kbd>Esc</Kbd> to close
				</span>
			</ComponentCard>
		</ShowcaseSection>
	);
}
