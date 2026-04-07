import { command } from "@superset/cli-framework";

export default command({
	description: "Stop the host service daemon",
	run: async () => {
		// TODO: read PID file, kill process
		return { message: "Not implemented yet" };
	},
});
