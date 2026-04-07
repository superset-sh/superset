import { command } from "@superset/cli-framework";

export default command({
	description: "Install host service to run on boot",
	run: async () => {
		// TODO: write launchd plist or systemd unit
		return { message: "Not implemented yet" };
	},
});
