import { command } from "../../../lib/command";

export default command({
	description: "Install host service to run on boot",
	skipMiddleware: true,
	run: async () => {
		// TODO: write launchd plist or systemd unit
		return { message: "Not implemented yet" };
	},
});
