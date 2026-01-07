#!/usr/bin/env bun
/**
 * Patches trpc-electron to fix compatibility with Electron 39+ / Node.js 22+
 *
 * Node.js 22+ has Symbol.asyncDispose built-in on AsyncIterators, which causes
 * trpc-electron to throw "Symbol.asyncDispose already exists" when trying to
 * add its own dispose function.
 *
 * This patch removes the existence check and allows overwriting the symbol.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const nodeModulesPath = join(import.meta.dir, "..", "node_modules");
const trpcElectronPath = join(nodeModulesPath, "trpc-electron");

if (!existsSync(trpcElectronPath)) {
	console.log("trpc-electron not found, skipping patch");
	process.exit(0);
}

// Patch the source TypeScript file
const utilsPath = join(trpcElectronPath, "src", "main", "utils.ts");
if (existsSync(utilsPath)) {
	let content = readFileSync(utilsPath, "utf-8");
	const originalContent = content;

	// Remove the check that throws when Symbol.asyncDispose exists
	content = content.replace(
		/\/\/ eslint-disable-next-line no-restricted-syntax\s*\n\s*if \(it\[Symbol\.asyncDispose\]\) \{\s*\n\s*throw new Error\('Symbol\.asyncDispose already exists'\);\s*\n\s*\}\s*\n/,
		"// Node.js 22+ / Electron 39+ has Symbol.asyncDispose built-in on AsyncIterators\n  // We overwrite it with our custom dispose function\n"
	);

	if (content !== originalContent) {
		writeFileSync(utilsPath, content);
		console.log("Patched trpc-electron/src/main/utils.ts");
	}
}

// Patch the ESM dist file
const mainMjsPath = join(trpcElectronPath, "dist", "main.mjs");
if (existsSync(mainMjsPath)) {
	let content = readFileSync(mainMjsPath, "utf-8");
	const originalContent = content;

	// Remove the check in the Fe function
	content = content.replace(
		/function Fe\(r, e\) \{\s*\n\s*const t = r;\s*\n\s*if \(t\[Symbol\.asyncDispose\]\)\s*\n\s*throw new Error\("Symbol\.asyncDispose already exists"\);\s*\n\s*return t\[Symbol\.asyncDispose\] = e, t;\s*\n\}/,
		'function Fe(r, e) {\n  const t = r;\n  // Allow overwriting Symbol.asyncDispose for Node.js 22+ / Electron 39+ compatibility\n  return t[Symbol.asyncDispose] = e, t;\n}'
	);

	if (content !== originalContent) {
		writeFileSync(mainMjsPath, content);
		console.log("Patched trpc-electron/dist/main.mjs");
	}
}

// Patch the CJS dist file (minified)
const mainCjsPath = join(trpcElectronPath, "dist", "main.cjs");
if (existsSync(mainCjsPath)) {
	let content = readFileSync(mainCjsPath, "utf-8");
	const originalContent = content;

	// Remove the check in the minified ke function
	content = content.replace(
		/function ke\(r,e\)\{const t=r;if\(t\[Symbol\.asyncDispose\]\)throw new Error\("Symbol\.asyncDispose already exists"\);return t\[Symbol\.asyncDispose\]=e,t\}/,
		"function ke(r,e){const t=r;return t[Symbol.asyncDispose]=e,t}"
	);

	if (content !== originalContent) {
		writeFileSync(mainCjsPath, content);
		console.log("Patched trpc-electron/dist/main.cjs");
	}
}

console.log("trpc-electron patch complete");
