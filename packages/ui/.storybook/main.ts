import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
	stories: [
		{ directory: "../src/components", files: "**/*.stories.@(ts|tsx)" },
	],
	framework: "@storybook/react-vite",
	viteFinal: (viteConfig) => {
		viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
		return viteConfig;
	},
};

export default config;
