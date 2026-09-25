import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	formatSettingValue,
	getSettingDefinition,
	writeSettingValue,
} from "../../../lib/settings";
import { HOST_EFFECT, LOCAL_DB_EFFECT } from "../notes";

export default command({
	description: "Reset a desktop app setting to its default",
	args: [positional("key").required().desc("Setting key (see: settings list)")],
	skipMiddleware: true,
	run: async ({ args }) => {
		const def = getSettingDefinition(args.key as string);
		const refreshed = await writeSettingValue(def, null);
		const defaultLabel = formatSettingValue(def.defaultValue) || "app default";
		const effect = refreshed
			? "The running desktop app refreshed immediately."
			: def.store === "hostService"
				? HOST_EFFECT
				: LOCAL_DB_EFFECT;
		return {
			data: { key: def.key, value: null, default: def.defaultValue },
			message: `Reset ${def.key} to its default (${defaultLabel}). ${effect}`,
		};
	},
});
