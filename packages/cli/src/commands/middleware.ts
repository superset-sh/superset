import { CLIError, middleware } from "@superset/cli-framework";
import { createApiClient } from "../lib/api-client";
import { readConfig, readDeviceConfig } from "../lib/config";

export default middleware(async (opts) => {
	const config = readConfig();
	if (!config.auth) {
		throw new CLIError("Not logged in", "Run: superset auth login");
	}
	const api = createApiClient(config);
	const deviceId =
		(opts.options.device as string) ?? readDeviceConfig()?.deviceId;
	return opts.next({ ctx: { api, config, deviceId } });
});
