import { describe, expect, test } from "bun:test";
import { nameLinks, workspaceCell } from "./command";

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "22222222-2222-4222-8222-222222222222";

type Link = { workspaceId: string; entryPath: string };

const row = (links?: Link[]) => ({
	id: "page-1",
	title: "Q3 pipeline",
	workspaceLinks: links,
});

function named(links: Link[], names: Map<string, string>) {
	const [first] = nameLinks([row(links)], names);
	if (!first) throw new Error("nameLinks dropped the row");
	return first;
}

describe("workspaceCell", () => {
	test("prefers the resolved name over the id", () => {
		expect(
			workspaceCell(
				named(
					[{ workspaceId: WORKSPACE_A, entryPath: "report.html" }],
					new Map([[WORKSPACE_A, "pipeline-review"]]),
				),
			),
		).toBe("pipeline-review");
	});

	test("falls back to a short id when the workspace is on another machine", () => {
		expect(
			workspaceCell(row([{ workspaceId: WORKSPACE_A, entryPath: "a.html" }])),
		).toBe("11111111");
	});

	test("counts the rest when a page was published from several workspaces", () => {
		expect(
			workspaceCell(
				named(
					[
						{ workspaceId: WORKSPACE_A, entryPath: "a.html" },
						{ workspaceId: WORKSPACE_B, entryPath: "b.html" },
					],
					new Map([[WORKSPACE_A, "pipeline-review"]]),
				),
			),
		).toBe("pipeline-review +1");
	});

	test("shows a name from a later link when the first is unresolved", () => {
		expect(
			workspaceCell(
				named(
					[
						{ workspaceId: WORKSPACE_B, entryPath: "b.html" },
						{ workspaceId: WORKSPACE_A, entryPath: "a.html" },
					],
					new Map([[WORKSPACE_A, "pipeline-review"]]),
				),
			),
		).toBe("pipeline-review +1");
	});

	test("marks a page that belongs to no workspace", () => {
		expect(workspaceCell(row([]))).toBe("—");
		expect(workspaceCell(row())).toBe("—");
	});
});

describe("nameLinks", () => {
	test("leaves rows untouched when no workspace name is known", () => {
		const rows = [row([{ workspaceId: WORKSPACE_A, entryPath: "a.html" }])];
		expect(nameLinks(rows, new Map())).toBe(rows);
	});

	test("names only the links it can resolve", () => {
		expect(
			named(
				[
					{ workspaceId: WORKSPACE_A, entryPath: "a.html" },
					{ workspaceId: WORKSPACE_B, entryPath: "b.html" },
				],
				new Map([[WORKSPACE_A, "pipeline-review"]]),
			).workspaceLinks,
		).toEqual([
			{
				workspaceId: WORKSPACE_A,
				entryPath: "a.html",
				name: "pipeline-review",
			},
			{ workspaceId: WORKSPACE_B, entryPath: "b.html" },
		]);
	});
});
