import { string } from "@superset/cli-framework";
import { runCdpProxyWorker } from "../../../lib/cdp-proxy/worker";
import { command } from "../../../lib/command";

export default command({
	description: "Run the local CDP proxy worker",
	hidden: true,
	skipMiddleware: true,
	options: { instance: string().required() },
	run: async ({ signal, options }) => {
		try {
			await runCdpProxyWorker(signal, options.instance);
		} catch {
			throw new Error("CDP proxy worker failed");
		}
	},
});
