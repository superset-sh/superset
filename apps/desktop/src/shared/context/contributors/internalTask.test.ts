import { describe, expect, test } from "bun:test";
import type { InternalTaskContent, ResolveCtx } from "../types";
import { internalTaskContributor } from "./internalTask";

function makeCtx(
	fetchInternalTask: (id: string) => Promise<InternalTaskContent>,
): ResolveCtx {
	return {
		projectId: "p",
		signal: new AbortController().signal,
		fetchIssue: async () => {
			throw new Error("unused");
		},
		fetchPullRequest: async () => {
			throw new Error("unused");
		},
		fetchInternalTask,
	};
}

const TASK: InternalTaskContent = {
	id: "TASK-42",
	slug: "refactor-auth",
	title: "Refactor auth middleware",
	description: "Split session-token storage from request handling.",
};

describe("internalTaskContributor", () => {
	test("metadata", () => {
		expect(internalTaskContributor.kind).toBe("internal-task");
		expect(internalTaskContributor.requiresQuery).toBe(true);
	});

	test("resolves to a section with explicit kind + id in header", async () => {
		const section = await internalTaskContributor.resolve(
			{ kind: "internal-task", id: TASK.id },
			makeCtx(async () => TASK),
		);
		expect(section?.id).toBe(`task:${TASK.id}`);
		expect(section?.label).toBe(`Task ${TASK.id} — ${TASK.title}`);
		const text = (section?.content[0] as { type: "text"; text: string }).text;
		expect(text).toContain(`# Task ${TASK.id} — ${TASK.title}`);
		if (TASK.description) expect(text).toContain(TASK.description);
		expect(section?.meta).toEqual({ taskSlug: TASK.slug });
	});

	test("omits description when null", async () => {
		const section = await internalTaskContributor.resolve(
			{ kind: "internal-task", id: TASK.id },
			makeCtx(async () => ({ ...TASK, description: null })),
		);
		const text = (section?.content[0] as { type: "text"; text: string }).text;
		expect(text).toBe(`# Task ${TASK.id} — ${TASK.title}`);
	});

	test("returns null on 404", async () => {
		const section = await internalTaskContributor.resolve(
			{ kind: "internal-task", id: TASK.id },
			makeCtx(async () => {
				throw Object.assign(new Error("not found"), { status: 404 });
			}),
		);
		expect(section).toBeNull();
	});
});
