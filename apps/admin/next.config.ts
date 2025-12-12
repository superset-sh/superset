import type { NextConfig } from "next";

const config: NextConfig = {
	experimental: {
		reactCompiler: true,
	},
	typescript: { ignoreBuildErrors: true },
};

export default config;
