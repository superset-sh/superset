import {
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@superset/ui/command";
import { ThemeSwatch } from "renderer/components/ThemeSwatch";
import {
	SYSTEM_THEME_ID,
	useSetTheme,
	useSystemDarkThemeId,
	useSystemLightThemeId,
	useThemeId,
	useThemeStore,
} from "renderer/stores";
import {
	builtInThemes,
	darkTheme as defaultDarkTheme,
	lightTheme as defaultLightTheme,
	type Theme,
} from "shared/themes";
import { useFrameStackStore } from "../../core/frames";
import { useCommandPaletteQuery } from "../CommandPalette/CommandPalette";

function matchesQuery(haystack: string, query: string): boolean {
	if (!query) return true;
	return haystack.toLowerCase().includes(query.toLowerCase().trim());
}

export function ThemeFrame() {
	const activeThemeId = useThemeId();
	const setTheme = useSetTheme();
	const customThemes = useThemeStore((state) => state.customThemes);
	const systemLightThemeId = useSystemLightThemeId();
	const systemDarkThemeId = useSystemDarkThemeId();
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const query = useCommandPaletteQuery();

	const allThemes = [...builtInThemes, ...customThemes];
	const lightThemes = allThemes.filter((t) => t.type === "light");
	const darkThemes = allThemes.filter((t) => t.type === "dark");
	const customLight = lightThemes.filter((t) => t.isCustom);
	const customDark = darkThemes.filter((t) => t.isCustom);

	const systemLightTheme =
		allThemes.find((t) => t.id === systemLightThemeId) ??
		builtInThemes.find((t) => t.id === "light") ??
		defaultLightTheme;
	const systemDarkTheme =
		allThemes.find((t) => t.id === systemDarkThemeId) ??
		builtInThemes.find((t) => t.id === "dark") ??
		defaultDarkTheme;

	const pickTheme = (themeId: string) => {
		setTheme(themeId);
		setOpen(false);
	};

	const showSystem = matchesQuery(`System ${SYSTEM_THEME_ID}`, query);

	return (
		<CommandList>
			<CommandEmpty>No themes found.</CommandEmpty>

			{showSystem && (
				<CommandGroup>
					<CommandItem
						value={`system ${SYSTEM_THEME_ID}`}
						onSelect={() => pickTheme(SYSTEM_THEME_ID)}
					>
						<div className="flex shrink-0 -space-x-1">
							<ThemeSwatch theme={systemLightTheme} />
							<ThemeSwatch theme={systemDarkTheme} />
						</div>
						<span>System</span>
						{activeThemeId === SYSTEM_THEME_ID ? (
							<span className="ml-auto text-xs text-muted-foreground">✓</span>
						) : null}
					</CommandItem>
				</CommandGroup>
			)}

			{showSystem && <CommandSeparator />}

			<ThemeGroup
				heading="Light"
				themes={lightThemes.filter((t) => !t.isCustom)}
				activeId={activeThemeId}
				onSelect={pickTheme}
				query={query}
			/>

			<ThemeGroup
				heading="Dark"
				themes={darkThemes.filter((t) => !t.isCustom)}
				activeId={activeThemeId}
				onSelect={pickTheme}
				query={query}
			/>

			{(customLight.length > 0 || customDark.length > 0) && (
				<ThemeGroup
					heading="Custom"
					themes={[...customLight, ...customDark]}
					activeId={activeThemeId}
					onSelect={pickTheme}
					query={query}
				/>
			)}
		</CommandList>
	);
}

interface ThemeGroupProps {
	heading: string;
	themes: Theme[];
	activeId: string;
	onSelect: (themeId: string) => void;
	query: string;
}

function ThemeGroup({
	heading,
	themes,
	activeId,
	onSelect,
	query,
}: ThemeGroupProps) {
	const visible = themes.filter((theme) =>
		matchesQuery(`${heading} ${theme.name} ${theme.id}`, query),
	);
	if (visible.length === 0) return null;
	return (
		<CommandGroup heading={heading}>
			{visible.map((theme) => (
				<CommandItem
					key={`${heading}:${theme.id}`}
					value={`${heading} ${theme.name} ${theme.id}`}
					onSelect={() => onSelect(theme.id)}
				>
					<ThemeSwatch theme={theme} />
					<span>{theme.name}</span>
					{theme.id === activeId ? (
						<span className="ml-auto text-xs text-muted-foreground">✓</span>
					) : null}
				</CommandItem>
			))}
		</CommandGroup>
	);
}
