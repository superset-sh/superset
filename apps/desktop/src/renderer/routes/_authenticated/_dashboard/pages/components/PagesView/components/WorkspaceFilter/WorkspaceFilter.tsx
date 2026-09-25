import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { useState } from "react";

export interface PageWorkspaceOption {
	workspaceId: string;
	name: string;
	count: number;
}

interface WorkspaceFilterProps {
	value: string | null;
	options: PageWorkspaceOption[];
	onChange: (value: string | null) => void;
}

export function WorkspaceFilter({
	value,
	options,
	onChange,
}: WorkspaceFilterProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);

	const selected =
		options.find((option) => option.workspaceId === value) ?? null;
	const label = selected
		? selected.name
		: value
			? t({ message: "Unknown workspace" })
			: t({ message: "All workspaces" });

	const select = (next: string | null) => {
		onChange(next);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					title={label}
					aria-label={t({ message: `Filter by workspace: ${label}` })}
					className={cn(
						"h-8 max-w-44 gap-1.5 px-2.5 font-normal",
						value ? "text-foreground" : "text-muted-foreground",
					)}
				>
					<LayoutGrid className="size-4 shrink-0" />
					<span className="truncate text-sm">{label}</span>
					<ChevronDown className="size-3 shrink-0" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-64 p-0">
				<Command>
					<CommandInput placeholder={t({ message: "Search workspaces…" })} />
					<CommandList className="max-h-72">
						<CommandEmpty>
							<Trans>No workspaces found.</Trans>
						</CommandEmpty>
						<CommandGroup>
							<CommandItem
								aria-checked={value === null}
								onSelect={() => select(null)}
							>
								<LayoutGrid className="size-4 shrink-0" />
								<span className="text-sm">
									<Trans>All workspaces</Trans>
								</span>
								{value === null && (
									<Check className="ml-auto size-3.5 shrink-0" />
								)}
							</CommandItem>
							{options.map((option) => (
								<CommandItem
									key={option.workspaceId}
									value={`${option.name} ${option.workspaceId}`}
									aria-checked={value === option.workspaceId}
									onSelect={() => select(option.workspaceId)}
								>
									<LayoutGrid className="size-4 shrink-0" />
									<span className="truncate text-sm">{option.name}</span>
									<span className="ml-auto text-muted-foreground text-xs tabular-nums">
										{option.count}
									</span>
									{value === option.workspaceId && (
										<Check className="ml-1 size-3.5 shrink-0" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
