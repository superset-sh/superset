import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Delete workspaces",
	args: [positional("ids").required().variadic().desc("Workspace IDs")],
	options: {
		device: string().env("SUPERSET_DEVICE").desc("Device ID"),
	},
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
