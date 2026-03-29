import { ThemePreviewCard } from "@superset/ui/theme-preview-card";
import { cn } from "@superset/ui/utils";
import { HiCheck } from "react-icons/hi2";
import { getTerminalColors, type Theme } from "shared/themes";

interface ThemeCardProps {
	theme: Theme;
	isSelected: boolean;
	onSelect: () => void;
}

export function ThemeCard({ theme, isSelected, onSelect }: ThemeCardProps) {
	const terminal = getTerminalColors(theme);
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
			aria-pressed={isSelected}
			className="w-full text-left"
		>
			<ThemePreviewCard
				name={theme.name}
				subtitle={theme.author}
				backgroundColor={terminal.background}
				foregroundColor={terminal.foreground}
				promptColor={terminal.green}
				infoColor={terminal.cyan}
				readyColor={terminal.yellow}
				palette={accentColors}
				className={cn(
					"border-2 transition-all",
					isSelected
						? "border-primary ring-2 ring-primary/20"
						: "border-border hover:border-muted-foreground/50",
				)}
				footerRight={
					isSelected ? (
						<div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
							<HiCheck className="h-3 w-3 text-primary-foreground" />
						</div>
					) : null
				}
			/>
		</button>
	);
}
