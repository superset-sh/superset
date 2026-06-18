import { join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import { config as dotenvConfig } from "dotenv";
import type { NextConfig } from "next";

if (process.env.NODE_ENV !== "production") {
	dotenvConfig({
		path: join(process.cwd(), "../../.env"),
		override: process.env.SUPERSET_ONLINE_SERVICE !== "1",
		quiet: true,
	});
}

const config: NextConfig = {
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },
	distDir: process.env.SUPERSET_NEXT_DIST_DIR,

	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*.public.blob.vercel-storage.com",
			},
		],
	},
};

export default withSentryConfig(config, {
	org: "superset-sh",
	project: "api",
	silent: !process.env.CI,
	authToken: process.env.SENTRY_AUTH_TOKEN,
	widenClientFileUpload: true,
	tunnelRoute: "/monitoring",
	disableLogger: true,
	automaticVercelMonitors: true,
});
