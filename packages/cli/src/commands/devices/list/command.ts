import { CLIError, command, table } from "@superset/cli-framework";

export default command({
	description: "List all devices in the org",
	options: {},
	display: (data) =>
		table(data as Record<string, unknown>[], [
			"deviceName",
			"deviceType",
			"lastSeen",
		]),
	run: async () => {
		// TODO: needs device.list tRPC procedure on the API
		throw new CLIError(
			"Not implemented",
			"Needs device.list tRPC procedure on the API side",
		);
	},
});
