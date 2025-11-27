import { cn } from "@superset/ui/utils";
import { HiCheck } from "react-icons/hi2";
import { useSetTheme, useThemeId, useThemeStore } from "renderer/stores";
import { builtInThemes, type Theme } from "shared/themes";

export function AppearanceSettings() {
	const activeThemeId = useThemeId();
	const setTheme = useSetTheme();
	const customThemes = useThemeStore((state) => state.customThemes);

	const allThemes = [...builtInThemes, ...customThemes];

	return (
		<div className="p-6 max-w-4xl">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Appearance</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Customize how Superset looks on your device
				</p>
			</div>

			<div className="space-y-8">
				{/* Theme Section */}
				<div>
					<h3 className="text-sm font-medium mb-4">Theme</h3>
					<div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
						{allThemes.map((theme) => (
							<ThemeCard
								key={theme.id}
								theme={theme}
								isSelected={activeThemeId === theme.id}
								onSelect={() => setTheme(theme.id)}
							/>
						))}
					</div>
				</div>

				{/* Future: Custom theme import */}
				<div className="pt-6 border-t">
					<h3 className="text-sm font-medium mb-2">Custom Themes</h3>
					<p className="text-sm text-muted-foreground">
						Custom theme import coming soon. You'll be able to import JSON theme
						files to create your own themes.
					</p>
				</div>
			</div>
		</div>
	);
}

interface ThemeCardProps {
	theme: Theme;
	isSelected: boolean;
	onSelect: () => void;
}

function ThemeCard({ theme, isSelected, onSelect }: ThemeCardProps) {
	const bgColor = theme.terminal.background;
	const fgColor = theme.terminal.foreground;
	const accentColors = [
		theme.terminal.red,
		theme.terminal.green,
		theme.terminal.yellow,
		theme.terminal.blue,
		theme.terminal.magenta,
		theme.terminal.cyan,
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
							style={{ color: theme.terminal.green }}
						>
							$
						</span>
						<span className="text-[11px] font-mono" style={{ color: fgColor }}>
							npm run dev
						</span>
					</div>
					<div
						className="text-[11px] font-mono"
						style={{ color: theme.terminal.cyan }}
					>
						Starting development server...
					</div>
					<div
						className="text-[11px] font-mono"
						style={{ color: theme.terminal.yellow }}
					>
						Ready on http://localhost:3000
					</div>
				</div>

				{/* Color palette strip */}
				<div className="flex gap-1 mt-2">
					{accentColors.map((color, i) => (
						<div
							key={i}
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
				{isSelected && (
					<div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
						<HiCheck className="h-3 w-3 text-primary-foreground" />
					</div>
				)}
			</div>
		</button>
	);
}
