import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const renderer = resolve(import.meta.dir, "../..");

function parse(path: string) {
	return ts.createSourceFile(
		path,
		readFileSync(path, "utf8"),
		ts.ScriptTarget.Latest,
		true,
		path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
}

function moduleReferences(source: ts.SourceFile) {
	const references: string[] = [];
	function visit(node: ts.Node) {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			references.push(node.moduleSpecifier.text);
		}
		if (
			ts.isCallExpression(node) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				node.expression.getText(source) === "require")
		) {
			const argument = node.arguments[0];
			if (!argument || !ts.isStringLiteral(argument))
				throw new Error(
					`Dynamic dependency in emergency UI: ${source.fileName}`,
				);
			references.push(argument.text);
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	return references;
}

test("emergency UI has no transitive dependency on router, app providers, or UI libraries", () => {
	const allowed = new Set([
		"react",
		"@lingui/core/macro",
		"@superset/i18n",
		"@sentry/electron/renderer",
	]);
	const visited = new Set<string>();
	function check(path: string) {
		if (visited.has(path)) return;
		visited.add(path);
		const source = parse(path);
		for (const statement of source.statements) {
			if (
				!ts.isImportDeclaration(statement) ||
				!ts.isStringLiteral(statement.moduleSpecifier) ||
				statement.moduleSpecifier.text !== "react"
			)
				continue;
			const bindings = statement.importClause?.namedBindings;
			expect(
				bindings && ts.isNamedImports(bindings),
				`${path}: emergency React imports must be explicit`,
			).toBe(true);
			if (bindings && ts.isNamedImports(bindings)) {
				for (const element of bindings.elements) {
					expect(
						["Component", "ReactNode", "ErrorInfo"],
						`${path}: emergency UI must not use context hooks`,
					).toContain((element.propertyName ?? element.name).text);
				}
			}
		}
		for (const specifier of moduleReferences(source)) {
			if (!specifier.startsWith(".") && !specifier.startsWith("renderer/")) {
				expect(
					allowed.has(specifier),
					`${path} depends on ${specifier}; emergency UI must work without app providers`,
				).toBe(true);
				continue;
			}
			const base = specifier.startsWith("renderer/")
				? resolve(renderer, specifier.slice(9))
				: resolve(dirname(path), specifier);
			const target = [
				base,
				`${base}.ts`,
				`${base}.tsx`,
				`${base}/index.ts`,
				`${base}/index.tsx`,
			].find((candidate) => /\.tsx?$/.test(candidate) && existsSync(candidate));
			if (!target)
				throw new Error(
					`Unresolved emergency dependency: ${specifier} in ${path}`,
				);
			check(target);
		}
	}
	check(
		resolve(
			renderer,
			"components/RendererErrorBoundary/RendererErrorBoundary.tsx",
		),
	);
	check(resolve(renderer, "lib/boot-errors.ts"));
});

test("production renderer roots cannot bypass RendererRouter", async () => {
	const violations: string[] = [];
	for await (const relative of new Bun.Glob("**/*.{ts,tsx}").scan(renderer)) {
		if (/\.(test|spec)\./.test(relative) || relative.includes("/fixtures/"))
			continue;
		const source = parse(resolve(renderer, relative));
		for (const statement of source.statements) {
			if (
				!ts.isImportDeclaration(statement) ||
				!ts.isStringLiteral(statement.moduleSpecifier)
			)
				continue;
			const module = statement.moduleSpecifier.text;
			if (module === "react-dom/client" && relative !== "index.tsx")
				violations.push(relative);
			if (
				module !== "@tanstack/react-router" ||
				relative === "components/RendererRouter/RendererRouter.tsx"
			)
				continue;
			const bindings = statement.importClause?.namedBindings;
			if (bindings && ts.isNamespaceImport(bindings)) violations.push(relative);
			if (
				bindings &&
				ts.isNamedImports(bindings) &&
				bindings.elements.some((element) =>
					["RouterProvider", "RouterContextProvider", "Matches"].includes(
						(element.propertyName ?? element.name).text,
					),
				)
			)
				violations.push(relative);
		}
	}
	expect(violations).toEqual([]);
});

test("every production failure boundary is included in the renderer audit", async () => {
	const registrations: string[] = [];
	const options = new Set([
		"errorComponent",
		"notFoundComponent",
		"defaultErrorComponent",
		"defaultNotFoundComponent",
		"getDerivedStateFromError",
		"componentDidCatch",
	]);
	for await (const relative of new Bun.Glob("**/*.{ts,tsx}").scan(renderer)) {
		if (/\.(test|spec)\./.test(relative) || relative.includes("/fixtures/"))
			continue;
		const source = parse(resolve(renderer, relative));
		function visit(node: ts.Node) {
			if (
				(ts.isPropertyAssignment(node) ||
					ts.isJsxAttribute(node) ||
					ts.isMethodDeclaration(node)) &&
				node.name
			) {
				const name = ts.isStringLiteral(node.name)
					? node.name.text
					: node.name.getText(source);
				if (options.has(name)) registrations.push(`${relative}: ${name}`);
			}
			if (
				ts.isImportSpecifier(node) &&
				(node.propertyName ?? node.name).text === "CatchBoundary"
			) {
				registrations.push(`${relative}: CatchBoundary`);
			}
			ts.forEachChild(node, visit);
		}
		visit(source);
	}
	expect(registrations.sort()).toEqual(
		[
			"components/RendererErrorBoundary/RendererErrorBoundary.tsx: componentDidCatch",
			"components/RendererErrorBoundary/RendererErrorBoundary.tsx: getDerivedStateFromError",
			"index.tsx: defaultNotFoundComponent",
			"routes/__root.tsx: errorComponent",
			"routes/__root.tsx: notFoundComponent",
			"routes/_authenticated/components/ContentBoundary/ContentBoundary.tsx: CatchBoundary",
			"routes/_authenticated/components/ContentBoundary/ContentBoundary.tsx: errorComponent",
			"routes/_authenticated/_dashboard/project/$projectId/page.tsx: notFoundComponent",
			"routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx: notFoundComponent",
			"routes/_authenticated/settings/hosts/$hostId/page.tsx: notFoundComponent",
			"routes/_authenticated/settings/projects/$projectId/page.tsx: notFoundComponent",
		].sort(),
	);
});

test("settings and dashboard outlets retain their surrounding layout on render errors", () => {
	for (const relative of [
		"routes/_authenticated/settings/layout.tsx",
		"routes/_authenticated/_dashboard/layout.tsx",
	]) {
		const source = parse(resolve(renderer, relative));
		let outlets = 0;
		function visit(node: ts.Node, protectedByBoundary = false) {
			if (
				ts.isJsxElement(node) &&
				node.openingElement.tagName.getText(source) === "ContentBoundary"
			) {
				protectedByBoundary = true;
			}
			if (ts.isJsxSelfClosingElement(node)) {
				const tag = node.tagName.getText(source);
				if (tag === "Outlet") {
					outlets++;
					expect(
						protectedByBoundary,
						`${relative}: Outlet must have a content boundary`,
					).toBe(true);
				}
				if (tag === "SettingsSidebar") expect(protectedByBoundary).toBe(false);
			}
			ts.forEachChild(node, (child) => visit(child, protectedByBoundary));
		}
		visit(source);
		expect(outlets).toBeGreaterThan(0);
	}
});
