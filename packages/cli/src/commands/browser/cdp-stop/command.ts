import { string } from "@superset/cli-framework";
import { stopCdpProxy } from "../../../lib/cdp-proxy/client";
import { command } from "../../../lib/command";

export default command({
	description: "Stop an exported local CDP proxy",
	skipMiddleware: true,
	options: { id: string().required().desc("Proxy ID from browser cdp") },
	run: async ({ options }) => {
		const stopped = await stopCdpProxy(options.id);
		return {
			data: { proxyId: options.id, stopped },
			message: stopped ? "CDP proxy stopped" : "No CDP proxy found",
		};
	},
});
