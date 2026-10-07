import { readFileSync } from "node:fs";
import ts from "@typescript/typescript6";

export function getPackageName(specifier: string): string {
	if (specifier.startsWith("@")) {
		const [scope, name] = specifier.split("/");
		return `${scope}/${name}`;
	}
	return specifier.split("/")[0] ?? specifier;
}

function isRequireIdentifier(name: string): boolean {
	return /^require(\$\d+)?$/.test(name);
}

export function collectBareRequireSpecifiers(filePath: string): string[] {
	const sourceFile = ts.createSourceFile(
		filePath,
		readFileSync(filePath, "utf8"),
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.JS,
	);
	const specifiers: string[] = [];

	function visit(node: ts.Node): void {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			isRequireIdentifier(node.expression.text) &&
			node.arguments.length === 1
		) {
			const [argument] = node.arguments;
			if (argument && ts.isStringLiteralLike(argument)) {
				specifiers.push(argument.text);
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	return specifiers.filter(
		(specifier) => !specifier.startsWith(".") && !specifier.startsWith("/"),
	);
}
