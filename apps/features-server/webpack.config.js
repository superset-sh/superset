const path = require("path");

/**
 * Build webpack resolve aliases from a package's exports map.
 * Converts entries like `"./hello-world": "./features/hello-world/index.ts"`
 * into `"@superbuilder/features-server/hello-world": "/abs/path/to/features/hello-world/index.ts"`
 */
function buildAliasesFromExports(pkgName, pkgDir) {
  const pkgJson = require(path.resolve(pkgDir, "package.json"));
  const exports = pkgJson.exports || {};
  const aliases = {};

  for (const [subpath, target] of Object.entries(exports)) {
    // Skip wildcard patterns — webpack alias doesn't support them
    if (subpath.includes("*")) continue;

    const importPath =
      subpath === "."
        ? pkgName
        : `${pkgName}/${subpath.replace(/^\.\//, "")}`;

    // Resolve target to absolute path
    const absTarget = path.resolve(pkgDir, target);
    // Use exact match ($) to prevent prefix matching (e.g., "core/logger" matching "core/logger/nestjs")
    aliases[`${importPath}$`] = absTarget;
  }

  return aliases;
}

const featuresServerDir = path.resolve(__dirname, "../../packages/features-server");
const featuresClientDir = path.resolve(__dirname, "../../packages/features-client");

module.exports = (options, webpack) => {
  // Remove ForkTsCheckerWebpackPlugin — we use transpileOnly and handle type-checking separately
  const plugins = (options.plugins || []).filter(
    (p) => p.constructor.name !== "ForkTsCheckerWebpackPlugin",
  );

  return {
    ...options,
    plugins,
    // Include workspace packages in the bundle, but externalize SDK that uses dynamic import
    externals: [
      { "@anthropic-ai/claude-agent-sdk": "commonjs @anthropic-ai/claude-agent-sdk" },
    ],
    module: {
      ...options.module,
      rules: [
        {
          test: /\.tsx?$/,
          loader: "ts-loader",
          options: {
            transpileOnly: true,
          },
          exclude: /node_modules\/(?!@superbuilder)/,
        },
      ],
    },
    resolve: {
      ...options.resolve,
      extensions: [".ts", ".tsx", ".js"],
      // Allow workspace packages to resolve deps from this app's node_modules
      modules: [
        path.resolve(__dirname, "node_modules"),
        "node_modules",
      ],
      alias: {
        "@superbuilder/drizzle": path.resolve(__dirname, "../../packages/drizzle/src"),
        // Subpath aliases from package.json exports (webpack doesn't resolve exports field natively)
        ...buildAliasesFromExports("@superbuilder/features-server", featuresServerDir),
        ...buildAliasesFromExports("@superbuilder/features-client", featuresClientDir),
        // Internal path aliases used by features-server package (from its tsconfig paths)
        "@/core": path.resolve(featuresServerDir, "core"),
        "@/shared": path.resolve(featuresServerDir, "shared"),
        "@/features": path.resolve(featuresServerDir, "features"),
        // Fallback base aliases
        "@superbuilder/features-server": featuresServerDir,
        "@superbuilder/features-client": featuresClientDir,
      },
    },
  };
};
