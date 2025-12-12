import type { NextConfig } from "next";

const config: NextConfig = {
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },
	// CORS is handled dynamically in the route handlers
};

export default config;
