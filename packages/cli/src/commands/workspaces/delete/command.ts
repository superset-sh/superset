import { CLIError, command, positional, string } from "@superset/cli-framework";

export default command({
	description: "Delete workspaces",
	args: [positional("ids").required().variadic().desc("Workspace IDs")],
	options: {
		device: string().env("SUPERSET_DEVICE").desc("Device ID"),
	},
	run: async (opts) => {
		if (!opts.ctx.deviceId) {
			throw new CLIError(
				"No device found",
				"Use --device or run: superset devices list",
			);
		}
		// TODO: route to device via websocket
		throw new CLIError(
			"Not implemented",
			"Needs device command routing via websocket",
		);
	},
});
