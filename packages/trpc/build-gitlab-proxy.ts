import { linguiMacroPlugin } from "@superset/i18n/bun-plugin";

const result = await Bun.build({
	entrypoints: ["src/gitlab-proxy.ts"],
	target: "node",
	format: "esm",
	outdir: "dist",
	naming: "gitlab-proxy.js",
	plugins: [linguiMacroPlugin],
	define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!result.success) {
	console.error("GitLab proxy build failed");
	for (const log of result.logs) console.error(log);
	process.exit(1);
}
