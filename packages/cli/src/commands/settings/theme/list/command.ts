import { table } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { listThemeChoices, readThemeState } from "../../../../lib/settings";

export default command({
	description: "List available themes (built-in, custom, and system)",
	skipMiddleware: true,
	display: (data) => {
		const { themes } = data as { themes: Record<string, unknown>[] };
		return table(
			themes,
			["id", "name", "type", "source", "active"],
			["ID", "NAME", "TYPE", "SOURCE", "ACTIVE"],
		);
	},
	run: async () => {
		const themeState = readThemeState();
		const themes = listThemeChoices(themeState).map((choice) => ({
			...choice,
			active: choice.id === themeState.activeThemeId ? "*" : "",
		}));
		return {
			data: {
				activeThemeId: themeState.activeThemeId,
				systemLightThemeId: themeState.systemLightThemeId,
				systemDarkThemeId: themeState.systemDarkThemeId,
				themes,
			},
		};
	},
});
