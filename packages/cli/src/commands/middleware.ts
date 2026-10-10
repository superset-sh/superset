import { middleware } from "@superset/cli-framework";
import { trackCommandInvoked } from "../lib/analytics";
import { resolveAuth } from "../lib/resolve-auth";

/** A host this spawns outlives the hour a borrowed host token lasts. */
const COMMANDS_NEEDING_OWN_LOGIN = new Set(["start"]);

export default middleware(async (opts) => {
	const options = opts.options as { apiKey?: string };
	const { config, api, bearer, authSource } = await resolveAuth(
		options.apiKey,
		{
			useHostToken: !COMMANDS_NEEDING_OWN_LOGIN.has(opts.commandPath[0] ?? ""),
		},
	);

	trackCommandInvoked({
		api,
		commandPath: opts.commandPath,
		flags: Object.keys(opts.options).filter(
			(k) => opts.options[k] !== undefined,
		),
	});

	return opts.next({
		ctx: { api, config, bearer, authSource },
	});
});
