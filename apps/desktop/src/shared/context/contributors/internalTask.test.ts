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
		readAgentInstructions: async () => {
			throw new Error("unused");
		},
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

	test("resolves to a user section with title + description + slug meta", async () => {
		const section = await internalTaskContributor.resolve(
			{ kind: "internal-task", id: TASK.id },
			makeCtx(async () => TASK),
		);
		expect(section).toEqual({
			id: `task:${TASK.id}`,
			kind: "internal-task",
			scope: "user",
			label: `Task ${TASK.id} — ${TASK.title}`,
			content: [
				{
					type: "text",
					text: `# ${TASK.title}\n\n${TASK.description}`,
				},
			],
			meta: { taskSlug: TASK.slug },
		});
	});

	test("omits description when null", async () => {
		const section = await internalTaskContributor.resolve(
			{ kind: "internal-task", id: TASK.id },
			makeCtx(async () => ({ ...TASK, description: null })),
		);
		expect(section?.content).toEqual([
			{ type: "text", text: `# ${TASK.title}` },
		]);
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
