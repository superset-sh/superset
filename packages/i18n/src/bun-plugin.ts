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
			// Returning undefined is a pass-through for Bun.build but an error
			// under Bun.plugin, so every branch hands back contents.
			const loader = path.endsWith(".tsx") ? "tsx" : "ts";
			const code = await Bun.file(path).text();
			if (
				path.includes("/node_modules/") ||
				!code.includes("@lingui/core/macro")
			)
				return { contents: code, loader };
			const result = await transformAsync(code, {
				filename: path,
				babelrc: false,
				configFile: false,
				parserOpts: { plugins: ["typescript"] },
				plugins: [linguiMacro],
			});
			return { contents: result?.code ?? code, loader };
		});
	},
};
