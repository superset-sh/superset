import type { NextConfig } from "next";

import { env } from "./src/env";

// Allowed origins for CORS
const allowedOrigins = [
	env.NEXT_PUBLIC_WEB_URL,
	env.NEXT_PUBLIC_ADMIN_URL,
].filter(Boolean) as string[];

const config: NextConfig = {
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },
	async headers() {
		// Generate CORS headers for each allowed origin
		return allowedOrigins.map((origin) => ({
			source: "/api/:path*",
			headers: [
				{ key: "Access-Control-Allow-Origin", value: origin },
				{ key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
				{
					key: "Access-Control-Allow-Headers",
					value: "Content-Type, Authorization, trpc-accept, x-trpc-source",
				},
				{ key: "Access-Control-Allow-Credentials", value: "true" },
			],
		}));
	},
};

export default config;
