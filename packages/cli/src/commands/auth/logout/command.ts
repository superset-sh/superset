import { command } from "../../../lib/command";
import { readConfig, writeConfig } from "../../../lib/config";
import { isSupersetTerminalContext } from "../../../lib/resolve-auth";

export default command({
	description: "Clear stored credentials",
	skipMiddleware: true,
	run: async () => {
		const config = readConfig();
		delete config.auth;
		delete config.apiKey;
		writeConfig(config);
		if (isSupersetTerminalContext()) {
			return {
				message:
					"Logged out.\nSuperset is managing auth for you in this terminal, so commands here stay signed in. Logout affects the CLI outside Superset terminals.",
			};
		}
		return { message: "Logged out." };
	},
});
