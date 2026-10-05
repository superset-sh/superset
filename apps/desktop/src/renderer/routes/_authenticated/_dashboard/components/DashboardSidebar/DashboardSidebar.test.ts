import { describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import ts from "typescript";

const source = ts.createSourceFile(
	"DashboardSidebar.tsx",
	await Bun.file(`${import.meta.dir}/DashboardSidebar.tsx`).text(),
	ts.ScriptTarget.Latest,
	true,
	ts.ScriptKind.TSX,
);
let renderProjectSource: string | undefined;
function findRenderProject(node: ts.Node) {
	if (
		ts.isVariableDeclaration(node) &&
		ts.isIdentifier(node.name) &&
		node.name.text === "renderProject"
	) {
		renderProjectSource = node.initializer?.getText(source);
	}
	ts.forEachChild(node, findRenderProject);
}
findRenderProject(source);
if (!renderProjectSource) throw new Error("Missing project renderer");
const { outputText } = ts.transpileModule(
	`const renderProject = ${renderProjectSource};`,
	{
		compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ESNext },
	},
);
const makeRenderer = new Function(
	"React",
	"SortableProjectWrapper",
	"isCollapsed",
	"isProjectDragDisabled",
	"sortMode",
	"projectCollections",
	"workspaceShortcutLabels",
	"refreshWorkspacePullRequest",
	"toggleProjectCollapsed",
	`${outputText}\nreturn renderProject;`,
) as (
	react: { createElement: typeof createElement },
	wrapper: string,
	isCollapsed: boolean,
	isProjectDragDisabled: boolean,
	sortMode: string,
	collections: { collectionByProjectId: Map<string, unknown> },
	shortcutLabels: Map<string, string>,
	refresh: () => void,
	toggle: () => void,
) => (project: { id: string }) => ReactElement<{ isDragDisabled: boolean }>;

function projectDragDisabled(
	isCollapsed: boolean,
	sortMode: string,
	inCollection: boolean,
	isProjectDragDisabled = false,
) {
	const renderProject = makeRenderer(
		{ createElement },
		"project-row",
		isCollapsed,
		isProjectDragDisabled,
		sortMode,
		{ collectionByProjectId: new Map(inCollection ? [["a", "team"]] : []) },
		new Map(),
		() => {},
		() => {},
	);
	return renderProject({ id: "a" }).props.isDragDisabled;
}

describe("project collection drag permissions", () => {
	for (const isCollapsed of [false, true]) {
		for (const sortMode of ["active", "created"]) {
			test(`${sortMode} sorting disables collection member drag with collapsed=${isCollapsed}`, () => {
				expect(projectDragDisabled(isCollapsed, sortMode, true)).toBe(true);
				expect(projectDragDisabled(isCollapsed, sortMode, false)).toBe(false);
			});
		}
		test(`manual sorting allows collection member drag with collapsed=${isCollapsed}`, () => {
			expect(projectDragDisabled(isCollapsed, "manual", true)).toBe(false);
		});
		test(`global drag lock applies with collapsed=${isCollapsed}`, () => {
			expect(projectDragDisabled(isCollapsed, "manual", true, true)).toBe(true);
			expect(projectDragDisabled(isCollapsed, "active", false, true)).toBe(
				true,
			);
		});
	}
});
