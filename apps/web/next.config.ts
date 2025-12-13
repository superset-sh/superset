import type { NextConfig } from "next";

const config: NextConfig = {
	reactCompiler: true,
	typescript: { ignoreBuildErrors: true },
};

export default config;
