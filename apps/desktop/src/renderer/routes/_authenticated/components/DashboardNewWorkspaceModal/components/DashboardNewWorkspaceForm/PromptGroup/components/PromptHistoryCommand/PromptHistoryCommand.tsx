import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { usePromptHistoryStore } from "renderer/stores/prompt-history";

interface PromptHistoryCommandProps {
	children: ReactNode;
	tooltipLabel: string;
	onSelect: (prompt: string) => void;
}

export function PromptHistoryCommand({
	children,
	tooltipLabel,
	onSelect,
}: PromptHistoryCommandProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const entries = usePromptHistoryStore((state) => state.entries);

	// Self-filtered substring match: cmdk's fuzzy scoring misranks long
	// multi-line prompt bodies.
	const query = searchQuery.trim().toLowerCase();
	const results = useMemo(
		() =>
			query
				? entries.filter((entry) => entry.prompt.toLowerCase().includes(query))
				: entries,
		[entries, query],
	);

	const handleSelect = (prompt: string) => {
		onSelect(prompt);
		setSearchQuery("");
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (!next) setSearchQuery("");
				setOpen(next);
			}}
		>
			<Tooltip>
				<PopoverTrigger asChild>
					<TooltipTrigger asChild>{children}</TooltipTrigger>
				</PopoverTrigger>
				<TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
			</Tooltip>
			<PopoverContent
				className="w-[440px] p-0"
				align="end"
				side="bottom"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={t({
							message: "Search previous prompts...",
						})}
						value={searchQuery}
						onValueChange={setSearchQuery}
					/>
					<CommandList className="max-h-[420px]">
						{results.length === 0 && (
							<CommandEmpty>
								{entries.length === 0
									? t({
											message: "Prompts you submit will show up here.",
										})
									: t({
											message: "No prompts found.",
										})}
							</CommandEmpty>
						)}
						{results.length > 0 && (
							<CommandGroup
								heading={
									query
										? t({
												message: plural(results.length, {
													one: "# result",
													other: "# results",
												}),
											})
										: t({
												message: "Recent prompts",
											})
								}
							>
								{results.map((entry) => (
									<CommandItem
										key={entry.id}
										value={entry.id}
										onSelect={() => handleSelect(entry.prompt)}
										className="group items-start gap-3 rounded-md px-2.5 py-2"
									>
										<div className="flex min-w-0 flex-1 flex-col gap-0.5">
											<span className="line-clamp-2 whitespace-pre-line text-sm leading-snug">
												{entry.prompt}
											</span>
											<span className="text-[11px] text-muted-foreground">
												{formatRelativeTime(entry.submittedAt)}
											</span>
										</div>
										<span className="ml-2 hidden shrink-0 self-center text-[11px] text-muted-foreground group-data-[selected=true]:inline">
											↵
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
