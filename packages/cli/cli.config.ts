import { boolean, defineConfig, string } from "@superset/cli-framework";

export default defineConfig({
	name: "superset",
	version: "0.1.0",
	commandsDir: "./src/commands",
	outfile: "./dist/superset",
	define: {
		"process.env.RELAY_URL": JSON.stringify(
			process.env.RELAY_URL ?? "https://relay.superset.sh",
		),
		"process.env.CLOUD_API_URL": JSON.stringify(
			process.env.CLOUD_API_URL ?? "https://api.superset.sh",
		),
		"process.env.SUPERSET_WEB_URL": JSON.stringify(
			process.env.SUPERSET_WEB_URL ?? "https://app.superset.sh",
		),
	},
	globals: {
		json: boolean().desc("Output as JSON"),
		quiet: boolean().desc("Output IDs only"),
		device: string().env("SUPERSET_DEVICE").desc("Override device"),
		apiKey: string()
			.env("SUPERSET_API_KEY")
			.desc("Use a Superset API key (sk_live_…) instead of OAuth login"),
	},
});
