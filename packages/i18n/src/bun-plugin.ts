import { transformAsync } from "@babel/core";
import linguiMacro from "@lingui/babel-plugin-lingui-macro";
import type { BunPlugin } from "bun";

// Lingui macros are compile-time: Vite and Next run them through babel/SWC,
// but Bun.build has no such step, so bundles that reach `msg()` through
// @superset/shared would ship the macro's runtime entry, which throws.
export const linguiMacroPlugin: BunPlugin = {
	name: "lingui-macro",
	setup(build) {
		build.onLoad({ filter: /\.tsx?$/ }, async ({ path }) => {
			if (path.includes("/node_modules/")) return undefined;
			const code = await Bun.file(path).text();
			if (!code.includes("@lingui/core/macro")) return undefined;
			const result = await transformAsync(code, {
				filename: path,
				babelrc: false,
				configFile: false,
				parserOpts: { plugins: ["typescript"] },
				plugins: [linguiMacro],
			});
			if (!result?.code) return undefined;
			return {
				contents: result.code,
				loader: path.endsWith(".tsx") ? "tsx" : "ts",
			};
		});
	},
};
