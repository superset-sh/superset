import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { removeCustomTheme } from "../../../../lib/settings";
import { THEME_EFFECT } from "../../notes";

export default command({
	description: "Remove a custom theme",
	args: [
		positional("id")
			.required()
			.desc("Custom theme id (built-ins can't be removed)"),
	],
	skipMiddleware: true,
	run: async ({ args }) => {
		const id = args.id as string;
		const { themeState, refreshed } = await removeCustomTheme(id);
		const effect = refreshed
			? "Applied to the running desktop app."
			: THEME_EFFECT;
		return {
			data: { removed: id, activeThemeId: themeState.activeThemeId },
			message: `Removed custom theme "${id}". Active theme: ${themeState.activeThemeId}. ${effect}`,
		};
	},
});
