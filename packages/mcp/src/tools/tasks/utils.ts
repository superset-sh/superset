import { db } from "@superset/db/client";
import type { TaskPriority } from "@superset/db/enums";
import { taskPriorityValues } from "@superset/db/enums";
import { tasks } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

export { taskPriorityValues, type TaskPriority };

export function isPriority(value: unknown): value is TaskPriority {
	return taskPriorityValues.includes(value as TaskPriority);
}

export async function resolveTaskId({
	taskId,
	organizationId,
}: {
	taskId: string;
	organizationId: string;
}) {
	const isUuid = z.string().uuid().safeParse(taskId).success;

	const [task] = await db
		.select({ id: tasks.id })
		.from(tasks)
		.where(
			and(
				isUuid ? eq(tasks.id, taskId) : eq(tasks.slug, taskId),
				eq(tasks.organizationId, organizationId),
				isNull(tasks.deletedAt),
			),
		)
		.limit(1);

	return task ?? null;
}

export function taskIdCondition(taskId: string) {
	const isUuid = z.string().uuid().safeParse(taskId).success;
	return isUuid ? eq(tasks.id, taskId) : eq(tasks.slug, taskId);
}

export function formatMcpResponse<T>(data: T) {
	return {
		structuredContent: data,
		content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
	};
}
