import { command } from "@superset/cli-framework";

export default command({
	description: "Check host service status",
	run: async () => {
		// TODO: check PID file
		return { data: { running: false }, message: "Host service is not running" };
	},
});
