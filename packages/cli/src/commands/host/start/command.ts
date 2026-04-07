import { boolean, command, number } from "@superset/cli-framework";

export default command({
	description: "Start the host service",
	options: {
		daemon: boolean().desc("Run in background"),
		port: number().default(51741).desc("Port to listen on"),
	},
	run: async (opts) => {
		if (opts.options.daemon) {
			// TODO: fork to background
			return {
				data: { pid: 0, port: opts.options.port },
				message: "Host service started",
			};
		}
		// TODO: foreground mode with opts.signal for cleanup
		return { message: "Not implemented yet" };
	},
});
