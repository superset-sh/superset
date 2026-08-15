"use client";

import { cn } from "@superset/ui/utils";
import { SlashSquareIcon } from "lucide-react";
import { Fragment } from "react";
import type { PromptInputCommand } from "../../types";

export type CommandMenuProps = {
	commands: PromptInputCommand[];
	selectedIndex: number | null;
	onHighlight: (index: number) => void;
	onSelect: (command: PromptInputCommand) => void;
};

export function CommandMenu({
	commands,
	selectedIndex,
	onHighlight,
	onSelect,
}: CommandMenuProps) {
	if (commands.length === 0) return null;
	let previousGroup: string | null = null;
	return (
		<div
			role="listbox"
			className="relative z-50 w-full rounded-2xl bg-popover/95 p-1.5 shadow-xl ring-1 ring-border backdrop-blur-sm"
		>
			<div className="scroll-fade max-h-96 overflow-y-auto">
				{commands.map((command, index) => {
					const group = command.group ?? null;
					const heading = group !== previousGroup ? group : null;
					previousGroup = group;
					return (
						<Fragment key={command.id}>
							{heading && (
								<p className="px-3 pt-2.5 pb-1 text-[13px] text-muted-foreground">
									{heading}
								</p>
							)}
							{/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the editor */}
							{/* biome-ignore lint/a11y/useFocusableInteractive: focus stays in the editor; listbox is virtual */}
							<div
								role="option"
								aria-selected={index === selectedIndex}
								className={cn(
									"flex cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-[5px] text-[15px] leading-[21px]",
									index === selectedIndex
										? "bg-accent text-accent-foreground"
										: "text-foreground",
								)}
								onMouseEnter={() => onHighlight(index)}
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => onSelect(command)}
							>
								<span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
									{command.icon ?? <SlashSquareIcon className="size-4.5" />}
								</span>
								<span className="shrink-0 font-medium">{command.title}</span>
								{command.description && (
									<span className="ml-auto min-w-0 truncate pl-6 text-muted-foreground">
										{command.description}
									</span>
								)}
								{command.rightIcon && (
									<span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
										{command.rightIcon}
									</span>
								)}
							</div>
						</Fragment>
					);
				})}
			</div>
		</div>
	);
}
