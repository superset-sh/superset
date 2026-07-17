// Minimal Node 20 ESM loader for running the daemon's TypeScript integration
// tests before Node's native --experimental-strip-types support. Production
// still runs the bundled JavaScript artifact; this loader is test-only.

import { readFile } from "node:fs/promises";
import ts from "typescript";

/**
 * @param {string} url
 * @param {Record<string, unknown>} context
 * @param {(url: string, context: Record<string, unknown>) => Promise<unknown>} nextLoad
 */
export async function load(url, context, nextLoad) {
	if (!url.startsWith("file:") || !url.endsWith(".ts")) {
		return nextLoad(url, context);
	}
	const source = await readFile(new URL(url), "utf8");
	const transpiled = ts.transpileModule(source, {
		compilerOptions: {
			esModuleInterop: true,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			target: ts.ScriptTarget.ES2022,
			verbatimModuleSyntax: true,
		},
		fileName: new URL(url).pathname,
		reportDiagnostics: false,
	});
	return {
		format: "module",
		shortCircuit: true,
		source: transpiled.outputText,
	};
}
