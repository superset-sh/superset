import { boolean, defineConfig, string } from "@superset/cli-framework";

const VERSION = "0.2.6";

export default defineConfig({
	name: "superset",
	version: VERSION,
	commandsDir: "./src/commands",
	outfile: "./dist/superset",
	define: {
		"process.env.RELAY_URL": JSON.stringify(
			process.env.RELAY_URL ?? "https://relay.superset.sh",
		),
		"process.env.SUPERSET_API_URL": JSON.stringify(
			process.env.SUPERSET_API_URL ?? "https://api.superset.sh",
		),
		"process.env.SUPERSET_WEB_URL": JSON.stringify(
			process.env.SUPERSET_WEB_URL ?? "https://app.superset.sh",
		),
		"process.env.SUPERSET_VERSION": JSON.stringify(VERSION),
	},
	globals: {
		json: boolean().desc("Output as JSON (auto-on under CI/agent envs)"),
		quiet: boolean().desc("Output IDs only"),
		apiKey: string()
			.env("SUPERSET_API_KEY")
			.desc("Use a Superset API key (sk_live_…) instead of OAuth login"),
	},
});
