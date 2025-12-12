import type { NextConfig } from "next";

const config: NextConfig = {
	reactStrictMode: true,
	experimental: {
		reactCompiler: true,
	},
	typescript: { ignoreBuildErrors: true },
};

export default config;
