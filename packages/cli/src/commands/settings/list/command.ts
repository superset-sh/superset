import { table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	allowedValues,
	formatSettingValue,
	readAllSettings,
	SETTINGS,
} from "../../../lib/settings";

export default command({
	description: "List desktop app settings and their current values",
	skipMiddleware: true,
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["key", "value", "default", "section", "description"],
			["KEY", "VALUE", "DEFAULT", "SECTION", "DESCRIPTION"],
			[30, 24, 18, 20, 60],
		),
	run: async () => {
		const readings = await readAllSettings(SETTINGS);
		const data = SETTINGS.map((def) => {
			const reading = readings.get(def.key) ?? { value: null, isSet: false };
			return {
				key: def.key,
				value: reading.note
					? `(${reading.note})`
					: formatSettingValue(
							reading.isSet ? reading.value : def.defaultValue,
						),
				isSet: reading.isSet,
				default: formatSettingValue(def.defaultValue),
				allowed: allowedValues(def),
				section: def.section,
				description: def.description,
			};
		});
		return { data };
	},
});
