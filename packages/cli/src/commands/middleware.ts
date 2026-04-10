import { middleware } from "@superset/cli-framework";
import { readDeviceConfig } from "../lib/config";
import { resolveAuth } from "../lib/resolve-auth";

export default middleware(async (opts) => {
	const options = opts.options as {
		apiKey?: string;
		device?: string;
	};
	const { config, api, bearer, authSource } = await resolveAuth(options.apiKey);
	const deviceId = options.device ?? readDeviceConfig()?.deviceId;
	return opts.next({
		ctx: { api, config, deviceId, bearer, authSource },
	});
});
