import { command } from "@superset/cli-framework";
import { readConfig, writeConfig } from "../../../lib/config";

export default command({
	description: "Clear stored credentials",

	run: async () => {
		const config = readConfig();
		delete config.auth;
		writeConfig(config);
		return { message: "Logged out." };
	},
});
