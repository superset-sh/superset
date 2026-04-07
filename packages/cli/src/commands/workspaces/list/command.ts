import { CLIError, command, string, table } from "@superset/cli-framework";

export default command({
	description: "List workspaces on a device",
	options: {
		device: string().env("SUPERSET_DEVICE").desc("Device ID"),
	},
	display: (data) =>
		table(data as Record<string, unknown>[], ["name", "branch", "projectName"]),
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
