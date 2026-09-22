import {
	type AgentModelOption,
	splitModelCatalog,
} from "@superset/shared/agent-models";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { groupModelOptions } from "./groupModelOptions";

// The agent picker beside this one is still a Radix Select, and the two read
// as one row of pills, so the trigger carries SelectTrigger's classes. Select
// itself can't host this menu: it has no submenus.
const TRIGGER_CLASS =
	"border-input [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 h-9 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

interface AgentModelSelectProps {
	models: AgentModelOption[];
	value: string | null;
	onValueChange: (model: string | null) => void;
	disabled?: boolean;
	triggerClassName?: string;
	contentClassName?: string;
	/** Trigger/item text for the default option — two adjacent selects both
	 * reading "Default" are indistinguishable, so callers name theirs. */
	defaultLabel?: string;
}

function ModelItem({
	model,
	selected,
	onSelect,
}: {
	model: AgentModelOption;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<DropdownMenuItem onSelect={onSelect} className="pr-8">
			{model.label}
			{selected && (
				<CheckIcon className="absolute right-2 size-4 text-foreground" />
			)}
		</DropdownMenuItem>
	);
}

/**
 * The picker for one launch option: the catalog's first section inline and
 * every later one behind a submenu, mirroring the mobile options screen.
 * Claude's four aliases sit at the top level and its ten pinned releases a
 * level down, where they no longer push the menu off the bottom of the
 * window.
 */
export function AgentModelSelect({
	models,
	value,
	onValueChange,
	disabled,
	triggerClassName,
	contentClassName,
	defaultLabel = "Default",
}: AgentModelSelectProps) {
	const selected =
		value !== null ? models.find((model) => model.id === value) : undefined;
	const { inline, groups } = splitModelCatalog(models);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<button type="button" className={cn(TRIGGER_CLASS, triggerClassName)}>
					<span className="truncate">{selected?.label ?? defaultLabel}</span>
					<ChevronDownIcon className="size-4 opacity-50" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className={contentClassName}>
				<ModelItem
					model={{ id: "", label: defaultLabel }}
					selected={selected === undefined}
					onSelect={() => onValueChange(null)}
				/>
				{groupModelOptions(inline).map((group, index) => (
					<DropdownMenuGroup key={`${group.label ?? "ungrouped"}-${index}`}>
						{group.label !== null && (
							<>
								{/* Every kind-change gets a rule, including the one
								    between the default escape hatch and the first
								    section — it is not a member of that section. */}
								<DropdownMenuSeparator />
								<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
									{group.label}
								</DropdownMenuLabel>
							</>
						)}
						{group.options.map((model) => (
							<ModelItem
								key={model.id}
								model={model}
								selected={model.id === selected?.id}
								onSelect={() => onValueChange(model.id)}
							/>
						))}
					</DropdownMenuGroup>
				))}
				{groups.length > 0 && <DropdownMenuSeparator />}
				{groups.map((group) => (
					<DropdownMenuSub key={group}>
						<DropdownMenuSubTrigger>
							{group}
							{selected?.group === group && (
								<span className="ml-auto text-muted-foreground">
									{selected.label}
								</span>
							)}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{models
								.filter((model) => model.group === group)
								.map((model) => (
									<ModelItem
										key={model.id}
										model={model}
										selected={model.id === selected?.id}
										onSelect={() => onValueChange(model.id)}
									/>
								))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
