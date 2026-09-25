import { Trans } from "@lingui/react/macro";
import { PopoverContent } from "@superset/ui/popover";
import { useEffect, useRef } from "react";
import type { SlashCommand } from "../../slash-commands";

interface SlashCommandMenuProps {
	commands: SlashCommand[];
	selectedIndex: number;
	onSelect: (command: SlashCommand) => void;
	onHover: (index: number) => void;
}

export function SlashCommandMenu({
	commands,
	selectedIndex,
	onSelect,
	onHover,
}: SlashCommandMenuProps) {
	const selectedRef = useRef<HTMLButtonElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: must scroll when selectedIndex changes
	useEffect(() => {
		selectedRef.current?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	if (commands.length === 0) return null;

	return (
		<PopoverContent
			side="top"
			align="start"
			sideOffset={4}
			className="w-[var(--radix-popover-trigger-width)] p-0 text-xs"
			onOpenAutoFocus={(e) => e.preventDefault()}
			onCloseAutoFocus={(e) => e.preventDefault()}
		>
			<div className="max-h-[200px] overflow-y-auto p-1">
				{commands.map((cmd, index) => (
					<button
						key={cmd.name}
						ref={index === selectedIndex ? selectedRef : undefined}
						type="button"
						className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors ${
							index === selectedIndex
								? "bg-accent text-accent-foreground"
								: "hover:bg-accent/50"
						}`}
						onMouseEnter={() => onHover(index)}
						onMouseDown={(e) => {
							e.preventDefault();
							onSelect(cmd);
						}}
					>
						<div className="flex items-center gap-1.5">
							<span className="font-medium">
								<span className="font-mono text-muted-foreground">/</span>
								{cmd.name}
							</span>
							{cmd.kind === "builtin" && (
								<span className="rounded-sm border border-border/70 bg-muted/40 px-1 py-0.5 font-mono text-[10px] text-muted-foreground uppercase leading-none">
									<Trans>builtin</Trans>
								</span>
							)}
							{cmd.argumentHint && (
								<span className="text-muted-foreground">
									{cmd.argumentHint}
								</span>
							)}
						</div>
						{cmd.description && (
							<span className="text-muted-foreground pl-4">
								{cmd.description}
							</span>
						)}
						{cmd.aliases.length > 0 && (
							<span className="text-muted-foreground pl-4 font-mono">
								<Trans>
									aliases: {cmd.aliases.map((alias) => `/${alias}`).join(", ")}
								</Trans>
							</span>
						)}
					</button>
				))}
			</div>
		</PopoverContent>
	);
}
