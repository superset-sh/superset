import { boolean, defineConfig, string } from "@superset/cli-framework";
import pkg from "./package.json" with { type: "json" };

// The release pipeline (release-cli.yml) is triggered by a `cli-v<semver>` tag
// and is the source of truth for the published version — it derives the
// rolling `version.txt` from that tag. Let it pin the binary's baked-in
// version via `SUPERSET_VERSION` so the tag and the binary can't drift
// (see #5294: `cli-v0.2.22` shipped a binary reporting `0.2.19` because the
// tag was cut before package.json was bumped). Falls back to package.json for
// local/dev builds where the env var isn't set.
const VERSION = process.env.SUPERSET_VERSION || pkg.version;

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
