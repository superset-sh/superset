import { command } from "../../../../lib/command";
import { readThemeState, SYSTEM_THEME_ID } from "../../../../lib/settings";

export default command({
	description: "Print the active desktop theme",
	skipMiddleware: true,
	run: async () => {
		const themeState = readThemeState();
		const suffix =
			themeState.activeThemeId === SYSTEM_THEME_ID
				? ` (light: ${themeState.systemLightThemeId}, dark: ${themeState.systemDarkThemeId})`
				: "";
		return {
			data: {
				activeThemeId: themeState.activeThemeId,
				systemLightThemeId: themeState.systemLightThemeId,
				systemDarkThemeId: themeState.systemDarkThemeId,
			},
			message: `${themeState.activeThemeId}${suffix}`,
		};
	},
});
