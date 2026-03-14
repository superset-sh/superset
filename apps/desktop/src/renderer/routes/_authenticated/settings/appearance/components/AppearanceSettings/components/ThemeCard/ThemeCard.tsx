import { cn } from "@superset/ui/utils";
import { HiCheck, HiOutlineTrash } from "react-icons/hi2";
import { getTerminalColors, type Theme } from "shared/themes";

interface ThemeCardProps {
	theme: Theme;
	isSelected: boolean;
	onSelect: () => void;
	onDelete?: () => void;
}

export function ThemeCard({
	theme,
	isSelected,
	onSelect,
	onDelete,
}: ThemeCardProps) {
	const terminal = getTerminalColors(theme);
	const bgColor = terminal.background;
	const fgColor = terminal.foreground;
	const accentColors = [
		terminal.red,
		terminal.green,
		terminal.yellow,
		terminal.blue,
		terminal.magenta,
		terminal.cyan,
	];

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
			{/* Theme Preview */}
			<div
				className="h-28 p-3 flex flex-col justify-between"
				style={{ backgroundColor: bgColor }}
			>
				{/* Fake terminal content */}
				<div className="space-y-1">
					<div className="flex items-center gap-1">
						<span
							className="text-[11px] font-mono"
							style={{ color: terminal.green }}
						>
							$
						</span>
						<span className="text-[11px] font-mono" style={{ color: fgColor }}>
							npm run dev
						</span>
					</div>
					<div
						className="text-[11px] font-mono"
						style={{ color: terminal.cyan }}
					>
						Starting development server...
					</div>
					<div
						className="text-[11px] font-mono"
						style={{ color: terminal.yellow }}
					>
						Ready on http://localhost:3000
					</div>
				</div>

				{/* Color palette strip */}
				<div className="flex gap-1 mt-2">
					{accentColors.map((color) => (
						<div
							key={color}
							className="h-2 w-5 rounded-sm"
							style={{ backgroundColor: color }}
						/>
					))}
				</div>
			</div>

			{/* Theme Info */}
			<div className="p-3 bg-card border-t flex items-center justify-between">
				<div>
					<div className="text-sm font-medium">{theme.name}</div>
					{theme.author && (
						<div className="text-xs text-muted-foreground">{theme.author}</div>
					)}
				</div>
				<div className="flex items-center gap-1">
					{onDelete && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onDelete();
							}}
							className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
							aria-label={`Delete ${theme.name}`}
						>
							<HiOutlineTrash className="h-3.5 w-3.5" />
						</button>
					)}
					{isSelected && (
						<div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
							<HiCheck className="h-3 w-3 text-primary-foreground" />
						</div>
					)}
				</div>
			</div>
		</button>
	);
}
