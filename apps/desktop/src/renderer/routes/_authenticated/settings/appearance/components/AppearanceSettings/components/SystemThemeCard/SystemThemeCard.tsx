import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import { HiCheck } from "react-icons/hi2";
import { useThemeStore } from "renderer/stores";
import { builtInThemes, type Theme } from "shared/themes";

interface SystemThemeCardProps {
	isSelected: boolean;
	onSelect: () => void;
}

function ThemeMappingSelect({
	label,
	value,
	themes,
	onChange,
}: {
	label: string;
	value: string;
	themes: Theme[];
	onChange: (themeId: string) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="text-xs text-muted-foreground shrink-0">{label}</span>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger size="sm" className="h-7 text-xs min-w-0 max-w-[140px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{themes.map((theme) => (
						<SelectItem key={theme.id} value={theme.id}>
							{theme.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function SystemThemeCard({
	isSelected,
	onSelect,
}: SystemThemeCardProps) {
	const customThemes = useThemeStore((state) => state.customThemes);
	const systemDarkThemeId = useThemeStore((state) => state.systemDarkThemeId);
	const systemLightThemeId = useThemeStore((state) => state.systemLightThemeId);
	const setSystemThemeMapping = useThemeStore(
		(state) => state.setSystemThemeMapping,
	);

	const allThemes = [...builtInThemes, ...customThemes];
	const darkThemes = allThemes.filter((t) => t.type === "dark");
	const lightThemes = allThemes.filter((t) => t.type === "light");

	const darkPreviewTheme =
		allThemes.find((t) => t.id === systemDarkThemeId) ?? darkThemes[0];
	const lightPreviewTheme =
		allThemes.find((t) => t.id === systemLightThemeId) ?? lightThemes[0];

	const darkTerminal = darkPreviewTheme?.terminal;
	const lightTerminal = lightPreviewTheme?.terminal;

	if (!darkTerminal || !lightTerminal) {
		return null;
	}

	return (
		<div
			className={cn(
				"relative flex flex-col rounded-lg border-2 overflow-hidden transition-all text-left",
				isSelected
					? "border-primary ring-2 ring-primary/20"
					: "border-border hover:border-muted-foreground/50",
			)}
		>
			{/* Theme Preview - Split view (clickable) */}
			<button
				type="button"
				onClick={onSelect}
				className="h-28 flex overflow-hidden cursor-pointer"
			>
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
			</button>

			{/* Theme Info */}
			<button
				type="button"
				onClick={onSelect}
				className="p-3 bg-card border-t flex items-center justify-between cursor-pointer"
			>
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
			</button>

			{/* Theme mapping selectors (only shown when selected) */}
			{isSelected && (
				<div className="px-3 pb-3 bg-card space-y-2">
					<ThemeMappingSelect
						label="Dark"
						value={systemDarkThemeId}
						themes={darkThemes}
						onChange={(id) => setSystemThemeMapping("dark", id)}
					/>
					<ThemeMappingSelect
						label="Light"
						value={systemLightThemeId}
						themes={lightThemes}
						onChange={(id) => setSystemThemeMapping("light", id)}
					/>
				</div>
			)}
		</div>
	);
}
