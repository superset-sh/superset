import { useSetTheme, useThemeId, useThemeStore } from "renderer/stores";
import { builtInThemes } from "shared/themes";
import { ThemeCard } from "./ThemeCard";

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
