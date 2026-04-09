import { build, context } from "esbuild";
import { cpSync } from "node:fs";

const isWatch = process.argv.includes("--watch");
const outdir = "Resources/WebContent";

// Copy static assets
cpSync("web-src/index.html", `${outdir}/index.html`);
cpSync("web-src/xterm.css", `${outdir}/xterm.css`);
// Also copy the xterm.js CSS from node_modules
cpSync("node_modules/@xterm/xterm/css/xterm.css", `${outdir}/xterm-lib.css`);

const options = {
  entryPoints: ["web-src/terminal-bridge.ts"],
  bundle: true,
  outfile: `${outdir}/terminal.js`,
  format: "esm" as const,
  target: "safari18.0",
  minify: !isWatch,
  sourcemap: true,
};

if (isWatch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await build(options);
  console.log("Build complete.");
}
