import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Create a workspace on a device",
	options: {
		device: string().env("SUPERSET_DEVICE").desc("Device ID"),
		project: string().required().desc("Project ID"),
		name: string().required().desc("Workspace name"),
		branch: string().required().desc("Git branch"),
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
