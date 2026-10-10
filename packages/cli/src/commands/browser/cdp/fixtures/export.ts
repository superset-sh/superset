import { createApiClient } from "../../../../lib/api-client";
import cdp from "../command";

const bearer = ["sk", "test", "cdp", "fixture"].join("_");
const organizationId = "org-fixture";
const result = await cdp.run({
	ctx: {
		bearer,
		authSource: "override",
		config: { organizationId },
		api: createApiClient({ bearer, organizationId }),
	},
	options: {
		workspace: "workspace-fixture",
		host: "remote-fixture",
		pane: "pane-fixture",
	},
	args: {},
	signal: new AbortController().signal,
});
process.stdout.write(JSON.stringify(result));
