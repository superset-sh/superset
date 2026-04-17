import { CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "List workspaces on a device",
	options: {
		device: string().env("SUPERSET_DEVICE").desc("Device ID"),
	},
	display: (data) =>
		table(data as Record<string, unknown>[], ["name", "branch", "projectName"]),
	run: async ({ ctx }) => {
		if (!ctx.deviceId) {
			throw new CLIError(
				"No device found",
				"Use --device or run: superset devices list",
			);
		}
		throw new CLIError(
			"Not implemented",
			"Needs device command routing via websocket",
		);
	},
});
