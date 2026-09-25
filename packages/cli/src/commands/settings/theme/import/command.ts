import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { importThemes } from "../../../../lib/settings";
import { THEME_EFFECT } from "../../notes";

export default command({
	description:
		"Import custom themes from a JSON file (single theme, array, or { themes: [...] })",
	args: [positional("file").required().desc("Path to a theme JSON file")],
	skipMiddleware: true,
	run: async ({ args }) => {
		const { imported, issues, refreshed } = await importThemes(
			args.file as string,
		);
		const ids = imported.map((theme) => theme.id);
		const issueSuffix = issues.length ? ` Skipped: ${issues.join("; ")}.` : "";
		const effect = refreshed
			? "The running desktop app refreshed immediately."
			: THEME_EFFECT;
		return {
			data: { imported: ids, issues },
			message: `Imported ${ids.length} theme${ids.length === 1 ? "" : "s"}: ${ids.join(", ")}.${issueSuffix} Activate with: superset settings theme set <id>. ${effect}`,
		};
	},
});
