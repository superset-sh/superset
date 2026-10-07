import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	createGitlabNodeServer,
	parseGitlabListen,
} from "./lib/gitlab/node-server";
import { resolveGitlabSandboxProxyConfig } from "./lib/gitlab/proxy-config";

async function main() {
	const listen = parseGitlabListen(process.argv.slice(2));
	const config = resolveGitlabSandboxProxyConfig(process.env);
	if (!config) throw new Error("Invalid broker configuration");
	const { createGitlabSandboxBroker } = await import(
		"./lib/gitlab/sandbox-broker"
	);
	const runtime = createGitlabNodeServer({
		config,
		handler: createGitlabSandboxBroker(config),
	});
	await new Promise<void>((done, reject) => {
		runtime.server.once("error", reject);
		runtime.server.listen(listen.port, listen.host, () => {
			runtime.server.off("error", reject);
			done();
		});
	});
	const stop = () => {
		void runtime.shutdown();
	};
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
	runtime.server.on("error", () => {
		console.error("GitLab proxy server failed");
		process.exitCode = 1;
		stop();
	});
	console.log("GitLab proxy listening");
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	void main().catch(() => {
		console.error("GitLab proxy startup failed");
		process.exitCode = 1;
	});
}
