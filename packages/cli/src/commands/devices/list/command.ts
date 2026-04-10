import { CLIError, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "List all devices in the organization",
	display: (data) =>
		table(data as Record<string, unknown>[], [
			"deviceName",
			"deviceType",
			"lastSeen",
		]),
	run: async () => {
		throw new CLIError(
			"Not implemented",
			"Needs device.list tRPC procedure on the API side",
		);
	},
});
