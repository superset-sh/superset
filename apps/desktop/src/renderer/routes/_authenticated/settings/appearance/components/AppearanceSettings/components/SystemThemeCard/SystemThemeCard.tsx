import { cn } from "@superset/ui/utils";
import { HiCheck } from "react-icons/hi2";
import { darkTheme, lightTheme } from "shared/themes";

interface SystemThemeCardProps {
	isSelected: boolean;
	onSelect: () => void;
}

export function SystemThemeCard({
	isSelected,
	onSelect,
}: SystemThemeCardProps) {
	const darkTerminal = darkTheme.terminal;
	const lightTerminal = lightTheme.terminal;

	if (!darkTerminal || !lightTerminal) {
		return null;
	}

	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"relative flex flex-col rounded-lg border-2 overflow-hidden transition-all text-left",
				isSelected
					? "border-primary ring-2 ring-primary/20"
					: "border-border hover:border-muted-foreground/50",
			)}
		>
			{/* Theme Preview - Split view */}
			<div className="h-28 flex overflow-hidden">
				{/* Dark half */}
				<div
					className="flex-1 p-3 flex flex-col justify-between"
					style={{ backgroundColor: darkTerminal.background }}
				>
					<div className="space-y-1">
						<div className="flex items-center gap-1">
							<span
								className="text-[11px] font-mono"
								style={{ color: darkTerminal.green }}
							>
								$
							</span>
							<span
								className="text-[11px] font-mono"
								style={{ color: darkTerminal.foreground }}
							>
								dev
							</span>
						</div>
						<div
							className="text-[11px] font-mono"
							style={{ color: darkTerminal.cyan }}
						>
							Starting...
						</div>
					</div>
					<div className="flex gap-0.5 mt-2">
						{[darkTerminal.red, darkTerminal.green, darkTerminal.yellow].map(
							(color) => (
								<div
									key={color}
									className="h-2 w-3 rounded-sm"
									style={{ backgroundColor: color }}
								/>
							),
						)}
					</div>
				</div>

				{/* Light half */}
				<div
					className="flex-1 p-3 flex flex-col justify-between border-l border-border/20"
					style={{ backgroundColor: lightTerminal.background }}
				>
					<div className="space-y-1">
						<div className="flex items-center gap-1">
							<span
								className="text-[11px] font-mono"
								style={{ color: lightTerminal.green }}
							>
								$
							</span>
							<span
								className="text-[11px] font-mono"
								style={{ color: lightTerminal.foreground }}
							>
								dev
							</span>
						</div>
						<div
							className="text-[11px] font-mono"
							style={{ color: lightTerminal.cyan }}
						>
							Starting...
						</div>
					</div>
					<div className="flex gap-0.5 mt-2">
						{[lightTerminal.red, lightTerminal.green, lightTerminal.yellow].map(
							(color) => (
								<div
									key={color}
									className="h-2 w-3 rounded-sm"
									style={{ backgroundColor: color }}
								/>
							),
						)}
					</div>
				</div>
			</div>

			{/* Theme Info */}
			<div className="p-3 bg-card border-t flex items-center justify-between">
				<div>
					<div className="text-sm font-medium">System</div>
					<div className="text-xs text-muted-foreground">
						Follows OS preference
					</div>
				</div>
				{isSelected && (
					<div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
						<HiCheck className="h-3 w-3 text-primary-foreground" />
					</div>
				)}
			</div>
		</button>
	);
}
