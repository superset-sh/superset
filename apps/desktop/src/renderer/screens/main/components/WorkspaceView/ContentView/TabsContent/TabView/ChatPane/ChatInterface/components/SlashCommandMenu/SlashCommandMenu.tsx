import { PopoverContent } from "@superset/ui/popover";
import { useEffect, useRef } from "react";
import type { SlashCommand } from "../../hooks/useSlashCommands";

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
			sideOffset={0}
			className="w-80 p-0 text-xs"
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
							<span className="font-mono text-muted-foreground">/</span>
							<span className="font-medium">{cmd.name}</span>
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
					</button>
				))}
			</div>
		</PopoverContent>
	);
}
