/** @see https://docs.slack.dev/messaging/work-objects/ */

import type {
	EntityMetadata,
	EntityType,
	TaskEntityFields,
} from "@slack/types";
import type { tasks } from "@superset/db/schema";

import { env } from "@/env";

const SUPERSET_PRODUCT_NAME = "Superset";

type TaskWithRelations = typeof tasks.$inferSelect & {
	status?: { id: string; name: string } | null;
	assignee?: { id: string; name: string | null; email: string } | null;
};

type TaskWithFullRelations = TaskWithRelations & {
	creator?: { id: string; name: string | null; email: string } | null;
	organization?: { id: string; name: string; slug: string } | null;
};

export function createTaskWorkObject(task: TaskWithRelations): EntityMetadata {
	const taskUrl = `${env.NEXT_PUBLIC_WEB_URL}/tasks/${task.slug}`;

	const fields: TaskEntityFields = {};
	const displayOrder: string[] = [];

	fields.status = {
		// Padded for spacing in Slack
		value: task.status
			? `${task.status.name}          `
			: "No status          ",
	};
	displayOrder.push("status");

	if (task.assignee) {
		fields.assignee = {
			type: "slack#/types/user",
			user: {
				text: task.assignee.name ?? task.assignee.email,
				email: task.assignee.email,
			},
		};
		displayOrder.push("assignee");
	}

	return {
		entity_type: "slack#/entities/task" as EntityType,
		url: taskUrl,
		app_unfurl_url: taskUrl,
		external_ref: {
			id: task.id,
			type: "task",
		},
		entity_payload: {
			attributes: {
				title: {
					text: task.title,
				},
				display_id: task.slug,
				display_type: "Task",
				product_name: SUPERSET_PRODUCT_NAME,
				full_size_preview: {
					is_supported: false,
				},
				metadata_last_modified: Math.floor(
					new Date(task.updatedAt).getTime() / 1000,
				),
			},
			fields,
			display_order: displayOrder,
		},
	};
}

/** Includes all task fields for the expanded flexpane side panel. */
export function createTaskFlexpaneObject(
	task: TaskWithFullRelations,
): EntityMetadata {
	const taskUrl = `${env.NEXT_PUBLIC_WEB_URL}/tasks/${task.slug}`;

	const fields: TaskEntityFields = {};
	const displayOrder: string[] = [];

	fields.description = {
		value: task.description || "No description",
		format: "markdown",
	};
	displayOrder.push("description");

	fields.status = {
		value: task.status?.name ?? "No status",
	};
	displayOrder.push("status");

	if (task.assignee) {
		fields.assignee = {
			type: "slack#/types/user",
			user: {
				text: task.assignee.name ?? task.assignee.email,
				email: task.assignee.email,
			},
		};
	} else {
		fields.assignee = {
			type: "string",
			value: "_Unassigned_",
			format: "markdown",
		};
	}
	displayOrder.push("assignee");

	const priorityValue = formatPriorityLabel(task.priority);
	fields.priority =
		task.priority === "none"
			? { value: "_None_", format: "markdown" }
			: { value: priorityValue };
	displayOrder.push("priority");

	const customFields: Array<{
		key: string;
		label: string;
		type: string;
		value?: string | number;
		format?: string;
		user?: { text: string; email?: string };
	}> = [];

	const labels = task.labels as string[] | null;
	customFields.push(
		labels && labels.length > 0
			? {
					key: "labels",
					label: "Labels",
					type: "string",
					value: labels.join(", "),
				}
			: {
					key: "labels",
					label: "Labels",
					type: "string",
					value: "_None_",
					format: "markdown",
				},
	);

	customFields.push({
		key: "organization",
		label: "Organization",
		type: "string",
		value: task.organization?.name ?? "—",
	});

	if (task.creator) {
		customFields.push({
			key: "created_by",
			label: "Created by",
			type: "slack#/types/user",
			user: {
				text: task.creator.name ?? task.creator.email,
				email: task.creator.email,
			},
		});
	} else {
		customFields.push({
			key: "created_by",
			label: "Created by",
			type: "string",
			value: "_Unknown_",
			format: "markdown",
		});
	}

	customFields.push({
		key: "created",
		label: "Created",
		type: "slack#/types/timestamp",
		value: Math.floor(new Date(task.createdAt).getTime() / 1000),
	});

	customFields.push({
		key: "updated",
		label: "Updated",
		type: "slack#/types/timestamp",
		value: Math.floor(new Date(task.updatedAt).getTime() / 1000),
	});

	return {
		entity_type: "slack#/entities/task" as EntityType,
		url: taskUrl,
		app_unfurl_url: taskUrl,
		external_ref: {
			id: task.id,
			type: "task",
		},
		entity_payload: {
			attributes: {
				title: {
					text: task.title,
				},
				display_id: task.slug,
				display_type: "Task",
				product_name: SUPERSET_PRODUCT_NAME,
				full_size_preview: {
					is_supported: false,
				},
				metadata_last_modified: Math.floor(
					new Date(task.updatedAt).getTime() / 1000,
				),
			},
			fields,
			custom_fields: customFields,
			display_order: displayOrder,
			actions: {
				primary_actions: [
					{
						text: "Open in Superset",
						action_id: "open_task",
						style: "primary",
						url: taskUrl,
					},
				],
			},
		},
	};
}

function formatPriorityLabel(priority: string): string {
	const labels: Record<string, string> = {
		urgent: "Urgent",
		high: "High",
		medium: "Medium",
		low: "Low",
		none: "None",
	};
	return labels[priority] ?? priority;
}

/**
 * Supports:
 *   - /tasks/my-task-slug (web app format)
 *   - /api/integrations/slack/tasks/my-task-slug (legacy API format)
 */
export function parseTaskSlugFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		const webMatch = parsed.pathname.match(/^\/tasks\/([^/]+)/);
		if (webMatch?.[1]) {
			return webMatch[1];
		}
		const apiMatch = parsed.pathname.match(
			/^\/api\/integrations\/slack\/tasks\/([^/]+)/,
		);
		return apiMatch?.[1] ?? null;
	} catch {
		return null;
	}
}
