import { command } from "../../../lib/command";
import { readConfig, writeConfig } from "../../../lib/config";

export default command({
	description: "Clear stored credentials",
	skipMiddleware: true,
	run: async () => {
		const config = readConfig();
		delete config.auth;
		delete config.apiKey;
		writeConfig(config);
		return { message: "Logged out." };
	},
});
