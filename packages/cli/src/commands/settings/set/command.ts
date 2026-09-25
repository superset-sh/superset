import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	getSettingDefinition,
	parseSettingValue,
	writeSettingValue,
} from "../../../lib/settings";
import { HOST_EFFECT, LOCAL_DB_EFFECT, RINGTONE_EFFECT } from "../notes";

export default command({
	description: "Set a desktop app setting",
	args: [
		positional("key").required().desc("Setting key (see: settings list)"),
		positional("value").required().desc("New value"),
	],
	skipMiddleware: true,
	run: async ({ args }) => {
		const def = getSettingDefinition(args.key as string);
		const value = parseSettingValue(def, args.value as string);
		const refreshed = await writeSettingValue(def, value);
		const effect = refreshed
			? "The running desktop app refreshed immediately."
			: def.store === "hostService"
				? HOST_EFFECT
				: def.key === "selectedRingtoneId"
					? RINGTONE_EFFECT
					: LOCAL_DB_EFFECT;
		return {
			data: { key: def.key, value },
			message: `Set ${def.key} = ${String(value)}. ${effect}`,
		};
	},
});
