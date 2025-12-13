import type { NextConfig } from "next";

const config: NextConfig = {
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },
	rewrites: async () => [
		{
			source: "/ingest/static/:path*",
			destination: "https://us-assets.i.posthog.com/static/:path*",
		},
		{
			source: "/ingest/:path*",
			destination: "https://us.i.posthog.com/:path*",
		},
	],
};

export default config;
