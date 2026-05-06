/**
 * Build @superset/sdk into a publish-ready ./dist directory.
 *
 *   bun run scripts/build.ts
 *
 * Then to publish:
 *   cd dist && npm publish --access public
 *
 * Strategy: bun bundles src/index.ts → dist/index.{js,cjs}; tsc emits the
 * .d.ts hierarchy into dist/. dist/package.json points at the bundled output.
 */

import { execSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = join(ROOT, "dist");

console.log(`> cleaning ${DIST}`);
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

console.log("> bun build (ESM)");
execSync(
	"bun build src/index.ts --outdir dist --target node --format esm --sourcemap=external",
	{ cwd: ROOT, stdio: "inherit" },
);

console.log("> bun build (CJS)");
execSync(
	'bun build src/index.ts --outdir dist --target node --format cjs --sourcemap=external --entry-naming "[dir]/[name].cjs"',
	{ cwd: ROOT, stdio: "inherit" },
);

console.log("> tsc emit .d.ts (uses tsconfig.json — emitDeclarationOnly)");
execSync(
	"bun x tsc -p tsconfig.json --outDir dist/types --incremental false --tsBuildInfoFile null",
	{ cwd: ROOT, stdio: "inherit" },
);

console.log("> copying LICENSE / README / api.md");
for (const f of ["LICENSE", "README.md", "api.md"]) {
	const src = join(ROOT, f);
	if (existsSync(src)) copyFileSync(src, join(DIST, f));
}

console.log("> writing dist/package.json");
const pkg = JSON.parse(
	readFileSync(join(ROOT, "package.json"), "utf-8"),
) as Record<string, unknown>;
const publishName =
	(pkg.publishConfig as { name?: string } | undefined)?.name ??
	(pkg.name as string);

const distPkg = {
	name: publishName,
	version: pkg.version,
	description: pkg.description,
	license: pkg.license,
	type: "module",
	main: "./index.cjs",
	module: "./index.js",
	types: "./types/index.d.ts",
	exports: {
		".": {
			types: "./types/index.d.ts",
			import: "./index.js",
			require: "./index.cjs",
		},
	},
	files: [
		"index.js",
		"index.js.map",
		"index.cjs",
		"index.cjs.map",
		"types/**/*.d.ts",
		"README.md",
		"LICENSE",
		"api.md",
	],
	dependencies: {},
	publishConfig: { access: "public" },
};
writeFileSync(
	join(DIST, "package.json"),
	`${JSON.stringify(distPkg, null, 2)}\n`,
);

console.log("\n✓ build complete");
console.log(`  ${DIST} → ready for: cd dist && npm publish`);
