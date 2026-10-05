import { resolve } from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import reactPlugin from "@vitejs/plugin-react";
import type { PluginOption } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

function isReactPlugin(plugin: PluginOption): boolean {
	return (
		typeof plugin === "object" &&
		plugin !== null &&
		"name" in plugin &&
		String(plugin.name).startsWith("vite:react")
	);
}

const config: StorybookConfig = {
	stories: [{ directory: "../src/renderer", files: "**/*.stories.@(ts|tsx)" }],
	framework: "@storybook/react-vite",
	staticDirs: [
		"../src/resources/public",
		{ from: "./fixtures", to: "/fixtures" },
	],
	viteFinal: (viteConfig) => {
		// Storybook adds its own React plugin; the renderer's needs the Lingui
		// macro compiled, so it replaces Storybook's rather than stacking on it.
		const plugins = (viteConfig.plugins ?? []).flat(Number.POSITIVE_INFINITY);
		viteConfig.plugins = [
			...plugins.filter((plugin) => !isReactPlugin(plugin)),
			tsconfigPaths({
				projects: [resolve(import.meta.dirname, "../tsconfig.json")],
			}),
			tailwindcss(),
			reactPlugin({
				babel: { plugins: ["@lingui/babel-plugin-lingui-macro"] },
			}),
		];
		viteConfig.define = {
			...viteConfig.define,
			"process.env.NODE_ENV": JSON.stringify("development"),
		};
		return viteConfig;
	},
};

export default config;
