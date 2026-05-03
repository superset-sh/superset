import { middleware } from "@superset/cli-framework";
import { resolveAuth } from "../lib/resolve-auth";

export default middleware(async (opts) => {
	const options = opts.options as { apiKey?: string };
	const { config, api, bearer, authSource } = await resolveAuth(options.apiKey);
	return opts.next({
		ctx: { api, config, bearer, authSource },
	});
});
