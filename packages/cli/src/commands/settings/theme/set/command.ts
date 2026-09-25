import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	readThemeState,
	requireThemeId,
	type ThemeState,
	writeThemeState,
} from "../../../../lib/settings";
import { THEME_EFFECT } from "../../notes";

export default command({
	description: "Set the active desktop theme",
	args: [
		positional("theme").desc(
			'Theme id, or "system" to follow the OS appearance (see: settings theme list)',
		),
	],
	options: {
		systemLight: string().desc(
			'Theme used for OS light mode when the active theme is "system"',
		),
		systemDark: string().desc(
			'Theme used for OS dark mode when the active theme is "system"',
		),
	},
	skipMiddleware: true,
	run: async ({ args, options }) => {
		const themeId = args.theme as string | undefined;
		if (!themeId && !options.systemLight && !options.systemDark) {
			throw new CLIError(
				"Nothing to change",
				"Pass a theme id, --system-light, or --system-dark. See: superset settings theme list",
			);
		}

		const themeState = readThemeState();
		const patch: Partial<ThemeState> = {};
		if (themeId) {
			patch.activeThemeId = requireThemeId(themeState, themeId, {
				allowSystem: true,
			});
		}
		if (options.systemLight) {
			patch.systemLightThemeId = requireThemeId(
				themeState,
				options.systemLight,
				{ allowSystem: false },
			);
		}
		if (options.systemDark) {
			patch.systemDarkThemeId = requireThemeId(themeState, options.systemDark, {
				allowSystem: false,
			});
		}

		const { themeState: next, refreshed } = await writeThemeState(patch);
		const summary = patch.activeThemeId
			? `Theme set to ${next.activeThemeId}.`
			: `Updated system theme mappings (light: ${next.systemLightThemeId}, dark: ${next.systemDarkThemeId}).`;
		const effect = refreshed
			? "Applied to the running desktop app."
			: THEME_EFFECT;
		return {
			data: {
				activeThemeId: next.activeThemeId,
				systemLightThemeId: next.systemLightThemeId,
				systemDarkThemeId: next.systemDarkThemeId,
			},
			message: `${summary} ${effect}`,
		};
	},
});
