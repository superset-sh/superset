import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { notifyDesktopSettingsChanged } from "../../../lib/settings/notify";
import {
	deleteTerminalScript,
	toPublicTerminalScript,
} from "../../../lib/terminal-scripts";
import { desktopSyncNote, requireOrganizationId } from "../shared";

export default command({
	description: "Delete a terminal script",
	args: [positional("id").required().desc("Script id from `scripts list`")],
	skipMiddleware: true,
	run: async ({ args }) => {
		const organizationId = requireOrganizationId();
		const id = args.id as string;
		const script = deleteTerminalScript({ organizationId, id });
		const refreshed = await notifyDesktopSettingsChanged();

		return {
			data: toPublicTerminalScript(script),
			message: `Deleted terminal script ${script.name} (${script.id}). ${desktopSyncNote(refreshed)}`,
		};
	},
});
