import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	allowedValues,
	formatSettingValue,
	getSettingDefinition,
	readSettingValue,
} from "../../../lib/settings";

export default command({
	description: "Print the current value of a desktop app setting",
	args: [positional("key").required().desc("Setting key (see: settings list)")],
	skipMiddleware: true,
	run: async ({ args }) => {
		const def = getSettingDefinition(args.key as string);
		const reading = await readSettingValue(def);
		const effective = reading.isSet ? reading.value : def.defaultValue;
		return {
			data: {
				key: def.key,
				value: effective,
				isSet: reading.isSet,
				default: def.defaultValue,
				allowed: allowedValues(def),
				description: def.description,
			},
			message: formatSettingValue(effective),
		};
	},
});
