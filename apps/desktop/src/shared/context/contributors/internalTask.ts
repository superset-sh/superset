import type { ContextContributor, InternalTaskContent } from "../types";

function isNotFound(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"status" in err &&
		(err as { status: number }).status === 404
	);
}

export const internalTaskContributor: ContextContributor<{
	kind: "internal-task";
	id: string;
}> = {
	kind: "internal-task",
	displayName: "Task",
	description: "Internal task spec inlined as context.",
	requiresQuery: true,
	async resolve(source, ctx) {
		let task: InternalTaskContent;
		try {
			task = await ctx.fetchInternalTask(source.id);
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}

		const description = task.description?.trim() ?? "";
		const heading = `# Task ${task.id} — ${task.title}`;
		const text = description ? `${heading}\n\n${description}` : heading;
		return {
			id: `task:${task.id}`,
			kind: "internal-task",
			label: `Task ${task.id} — ${task.title}`,
			content: [{ type: "text", text }],
			meta: { taskSlug: task.slug },
		};
	},
};
