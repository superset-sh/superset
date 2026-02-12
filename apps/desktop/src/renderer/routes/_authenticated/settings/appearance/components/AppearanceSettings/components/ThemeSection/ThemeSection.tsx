import {
	SYSTEM_THEME_ID,
	useSetTheme,
	useThemeId,
	useThemeStore,
} from "renderer/stores";
import { builtInThemes } from "shared/themes";
import { SystemThemeCard } from "../SystemThemeCard";
import { ThemeCard } from "../ThemeCard";

export function ThemeSection() {
	const activeThemeId = useThemeId();
	const setTheme = useSetTheme();
	const customThemes = useThemeStore((state) => state.customThemes);

	const allThemes = [...builtInThemes, ...customThemes];

	return (
		<div>
			<h3 className="text-sm font-medium mb-4">Theme</h3>
			<div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
				<SystemThemeCard
					isSelected={activeThemeId === SYSTEM_THEME_ID}
					onSelect={() => setTheme(SYSTEM_THEME_ID)}
				/>
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
	);
}
