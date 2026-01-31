import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, dbWs } from "@superset/db/client";
import {
	agentCommands,
	devicePresence,
	members,
	taskStatuses,
	tasks,
	users,
} from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import { and, desc, eq, gt, ilike, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { McpContext } from "./auth";

const DEVICE_ONLINE_THRESHOLD_MS = 60_000; // 60 seconds

/**
 * Extra parameter passed to tool handlers by withMcpAuth
 */
interface ToolHandlerExtra {
	authInfo?: {
		extra?: {
			mcpContext?: McpContext;
		};
	};
}

/**
 * Extract McpContext from tool handler's extra parameter
 */
function getContext(extra: ToolHandlerExtra): McpContext {
	const ctx = extra.authInfo?.extra?.mcpContext;
	if (!ctx) {
		throw new Error("No MCP context available - authentication required");
	}
	return ctx;
}

/**
 * Register all MCP tools on the server
 * Tools access context via extra.authInfo.extra.mcpContext
 */
export function registerMcpTools(server: McpServer) {
	// ========================================
	// TASK TOOLS (Cloud - Immediate Execution)
	// ========================================

	server.tool(
		"create_task",
		"Create a new task in the organization",
		{
			title: z.string().min(1).describe("Task title"),
			description: z
				.string()
				.optional()
				.describe("Task description (markdown)"),
			priority: z
				.enum(["urgent", "high", "medium", "low", "none"])
				.default("none")
				.describe("Task priority"),
			assigneeId: z
				.string()
				.uuid()
				.optional()
				.describe("User ID to assign the task to"),
			statusId: z
				.string()
				.uuid()
				.optional()
				.describe("Status ID (defaults to first backlog status)"),
			labels: z.array(z.string()).optional().describe("Array of label strings"),
			dueDate: z
				.string()
				.datetime()
				.optional()
				.describe("Due date in ISO format"),
			estimate: z
				.number()
				.int()
				.positive()
				.optional()
				.describe("Estimate in points/hours"),
		},
		async (params, extra) => {
			const ctx = getContext(extra);

			// Get default status if not provided
			let statusId = params.statusId;
			if (!statusId) {
				const defaultStatus = await db
					.select()
					.from(taskStatuses)
					.where(
						and(
							eq(taskStatuses.organizationId, ctx.organizationId),
							eq(taskStatuses.type, "backlog"),
						),
					)
					.orderBy(taskStatuses.position)
					.limit(1);
				statusId = defaultStatus[0]?.id;
				if (!statusId) {
					return {
						content: [
							{
								type: "text",
								text: "Error: No default status found for organization",
							},
						],
						isError: true,
					};
				}
			}

			// Generate slug from title
			const slug = params.title
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(0, 50);

			// Check for existing slug and make unique
			const existingTasks = await db
				.select({ slug: tasks.slug })
				.from(tasks)
				.where(
					and(
						eq(tasks.organizationId, ctx.organizationId),
						ilike(tasks.slug, `${slug}%`),
					),
				);

			let uniqueSlug = slug;
			if (existingTasks.length > 0) {
				const existingSlugs = new Set(existingTasks.map((t) => t.slug));
				let counter = 1;
				while (existingSlugs.has(uniqueSlug)) {
					uniqueSlug = `${slug}-${counter}`;
					counter++;
				}
			}

			const result = await dbWs.transaction(async (tx) => {
				const [task] = await tx
					.insert(tasks)
					.values({
						slug: uniqueSlug,
						title: params.title,
						description: params.description ?? null,
						priority: params.priority ?? "none",
						statusId,
						organizationId: ctx.organizationId,
						creatorId: ctx.userId,
						assigneeId: params.assigneeId ?? null,
						labels: params.labels ?? [],
						dueDate: params.dueDate ? new Date(params.dueDate) : null,
						estimate: params.estimate ?? null,
					})
					.returning();

				const txid = await getCurrentTxid(tx);
				return { task, txid };
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								id: result.task?.id,
								slug: result.task?.slug,
								title: result.task?.title,
								txid: result.txid,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"update_task",
		"Update an existing task",
		{
			taskId: z.string().describe("Task ID (uuid) or slug"),
			title: z.string().min(1).optional().describe("New title"),
			description: z.string().optional().describe("New description"),
			priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
			assigneeId: z
				.string()
				.uuid()
				.nullable()
				.optional()
				.describe("New assignee (null to unassign)"),
			statusId: z.string().uuid().optional().describe("New status ID"),
			labels: z.array(z.string()).optional().describe("Replace labels"),
			dueDate: z
				.string()
				.datetime()
				.nullable()
				.optional()
				.describe("New due date (null to clear)"),
			estimate: z.number().int().positive().nullable().optional(),
		},
		async (params, extra) => {
			const ctx = getContext(extra);

			// Find task by ID or slug
			const isUuid =
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
					params.taskId,
				);
			const [existingTask] = await db
				.select()
				.from(tasks)
				.where(
					and(
						isUuid
							? eq(tasks.id, params.taskId)
							: eq(tasks.slug, params.taskId),
						eq(tasks.organizationId, ctx.organizationId),
						isNull(tasks.deletedAt),
					),
				)
				.limit(1);

			if (!existingTask) {
				return {
					content: [{ type: "text", text: "Error: Task not found" }],
					isError: true,
				};
			}

			const updateData: Record<string, unknown> = {};
			if (params.title !== undefined) updateData.title = params.title;
			if (params.description !== undefined)
				updateData.description = params.description;
			if (params.priority !== undefined) updateData.priority = params.priority;
			if (params.assigneeId !== undefined)
				updateData.assigneeId = params.assigneeId;
			if (params.statusId !== undefined) updateData.statusId = params.statusId;
			if (params.labels !== undefined) updateData.labels = params.labels;
			if (params.dueDate !== undefined)
				updateData.dueDate = params.dueDate ? new Date(params.dueDate) : null;
			if (params.estimate !== undefined) updateData.estimate = params.estimate;

			const result = await dbWs.transaction(async (tx) => {
				const [task] = await tx
					.update(tasks)
					.set(updateData)
					.where(eq(tasks.id, existingTask.id))
					.returning();

				const txid = await getCurrentTxid(tx);
				return { task, txid };
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								id: result.task?.id,
								slug: result.task?.slug,
								title: result.task?.title,
								txid: result.txid,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"list_tasks",
		"List tasks with optional filters",
		{
			statusId: z.string().uuid().optional().describe("Filter by status ID"),
			statusType: z
				.enum(["backlog", "unstarted", "started", "completed", "canceled"])
				.optional()
				.describe("Filter by status type"),
			assigneeId: z.string().uuid().optional().describe("Filter by assignee"),
			assignedToMe: z
				.boolean()
				.optional()
				.describe("Filter to tasks assigned to current user"),
			priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
			search: z.string().optional().describe("Search in title/description"),
			limit: z.number().int().min(1).max(100).default(50),
			offset: z.number().int().min(0).default(0),
		},
		async (params, extra) => {
			const ctx = getContext(extra);
			const assignee = alias(users, "assignee");
			const status = alias(taskStatuses, "status");

			const conditions = [
				eq(tasks.organizationId, ctx.organizationId),
				isNull(tasks.deletedAt),
			];

			if (params.statusId) {
				conditions.push(eq(tasks.statusId, params.statusId));
			}

			if (params.assigneeId) {
				conditions.push(eq(tasks.assigneeId, params.assigneeId));
			} else if (params.assignedToMe) {
				conditions.push(eq(tasks.assigneeId, ctx.userId));
			}

			if (params.priority) {
				conditions.push(eq(tasks.priority, params.priority));
			}

			if (params.search) {
				const searchCondition = or(
					ilike(tasks.title, `%${params.search}%`),
					ilike(tasks.description, `%${params.search}%`),
				);
				if (searchCondition) {
					conditions.push(searchCondition);
				}
			}

			// Add status type filter if provided
			if (params.statusType) {
				// Get status IDs of the requested type
				const statusesOfType = await db
					.select({ id: taskStatuses.id })
					.from(taskStatuses)
					.where(
						and(
							eq(taskStatuses.organizationId, ctx.organizationId),
							eq(taskStatuses.type, params.statusType),
						),
					);
				const statusIds = statusesOfType.map((s) => s.id);
				if (statusIds.length > 0) {
					const statusCondition = or(
						...statusIds.map((id) => eq(tasks.statusId, id)),
					);
					if (statusCondition) {
						conditions.push(statusCondition);
					}
				} else {
					// No statuses of this type, return empty
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{ tasks: [], count: 0, hasMore: false },
									null,
									2,
								),
							},
						],
					};
				}
			}

			const tasksList = await db
				.select({
					id: tasks.id,
					slug: tasks.slug,
					title: tasks.title,
					description: tasks.description,
					priority: tasks.priority,
					statusId: tasks.statusId,
					statusName: status.name,
					statusType: status.type,
					assigneeId: tasks.assigneeId,
					assigneeName: assignee.name,
					labels: tasks.labels,
					dueDate: tasks.dueDate,
					estimate: tasks.estimate,
					createdAt: tasks.createdAt,
				})
				.from(tasks)
				.leftJoin(assignee, eq(tasks.assigneeId, assignee.id))
				.leftJoin(status, eq(tasks.statusId, status.id))
				.where(and(...conditions))
				.orderBy(desc(tasks.createdAt))
				.limit(params.limit)
				.offset(params.offset);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								tasks: tasksList,
								count: tasksList.length,
								hasMore: tasksList.length === params.limit,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_task",
		"Get a single task by ID or slug",
		{
			taskId: z.string().describe("Task ID (uuid) or slug"),
		},
		async (params, extra) => {
			const ctx = getContext(extra);
			const isUuid =
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
					params.taskId,
				);

			const assignee = alias(users, "assignee");
			const creator = alias(users, "creator");
			const status = alias(taskStatuses, "status");

			const [task] = await db
				.select({
					id: tasks.id,
					slug: tasks.slug,
					title: tasks.title,
					description: tasks.description,
					priority: tasks.priority,
					statusId: tasks.statusId,
					statusName: status.name,
					statusType: status.type,
					statusColor: status.color,
					assigneeId: tasks.assigneeId,
					assigneeName: assignee.name,
					assigneeEmail: assignee.email,
					creatorId: tasks.creatorId,
					creatorName: creator.name,
					labels: tasks.labels,
					dueDate: tasks.dueDate,
					estimate: tasks.estimate,
					branch: tasks.branch,
					prUrl: tasks.prUrl,
					createdAt: tasks.createdAt,
					updatedAt: tasks.updatedAt,
				})
				.from(tasks)
				.leftJoin(assignee, eq(tasks.assigneeId, assignee.id))
				.leftJoin(creator, eq(tasks.creatorId, creator.id))
				.leftJoin(status, eq(tasks.statusId, status.id))
				.where(
					and(
						isUuid
							? eq(tasks.id, params.taskId)
							: eq(tasks.slug, params.taskId),
						eq(tasks.organizationId, ctx.organizationId),
						isNull(tasks.deletedAt),
					),
				)
				.limit(1);

			if (!task) {
				return {
					content: [{ type: "text", text: "Error: Task not found" }],
					isError: true,
				};
			}

			return {
				content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
			};
		},
	);

	server.tool(
		"delete_task",
		"Soft delete a task",
		{
			taskId: z.string().describe("Task ID (uuid) or slug"),
		},
		async (params, extra) => {
			const ctx = getContext(extra);
			const isUuid =
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
					params.taskId,
				);

			const [existingTask] = await db
				.select()
				.from(tasks)
				.where(
					and(
						isUuid
							? eq(tasks.id, params.taskId)
							: eq(tasks.slug, params.taskId),
						eq(tasks.organizationId, ctx.organizationId),
						isNull(tasks.deletedAt),
					),
				)
				.limit(1);

			if (!existingTask) {
				return {
					content: [{ type: "text", text: "Error: Task not found" }],
					isError: true,
				};
			}

			const result = await dbWs.transaction(async (tx) => {
				await tx
					.update(tasks)
					.set({ deletedAt: new Date() })
					.where(eq(tasks.id, existingTask.id));

				const txid = await getCurrentTxid(tx);
				return { txid };
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								success: true,
								deletedAt: new Date().toISOString(),
								txid: result.txid,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// ========================================
	// ORGANIZATION TOOLS (Cloud - Immediate)
	// ========================================

	server.tool(
		"list_members",
		"List members in the organization",
		{
			search: z.string().optional().describe("Search by name or email"),
			limit: z.number().int().min(1).max(100).default(50),
		},
		async (params, extra) => {
			const ctx = getContext(extra);
			const conditions = [eq(members.organizationId, ctx.organizationId)];

			let query = db
				.select({
					id: users.id,
					name: users.name,
					email: users.email,
					image: users.image,
					role: members.role,
				})
				.from(members)
				.innerJoin(users, eq(members.userId, users.id))
				.where(and(...conditions))
				.limit(params.limit);

			if (params.search) {
				query = db
					.select({
						id: users.id,
						name: users.name,
						email: users.email,
						image: users.image,
						role: members.role,
					})
					.from(members)
					.innerJoin(users, eq(members.userId, users.id))
					.where(
						and(
							...conditions,
							or(
								ilike(users.name, `%${params.search}%`),
								ilike(users.email, `%${params.search}%`),
							),
						),
					)
					.limit(params.limit);
			}

			const membersList = await query;

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ members: membersList }, null, 2),
					},
				],
			};
		},
	);

	server.tool(
		"list_task_statuses",
		"List available task statuses for the organization",
		{},
		async (_params, extra) => {
			const ctx = getContext(extra);
			const statuses = await db
				.select({
					id: taskStatuses.id,
					name: taskStatuses.name,
					color: taskStatuses.color,
					type: taskStatuses.type,
					position: taskStatuses.position,
				})
				.from(taskStatuses)
				.where(eq(taskStatuses.organizationId, ctx.organizationId))
				.orderBy(taskStatuses.position);

			return {
				content: [
					{ type: "text", text: JSON.stringify({ statuses }, null, 2) },
				],
			};
		},
	);

	// ========================================
	// DEVICE TOOLS (Cloud - Query)
	// ========================================

	server.tool(
		"list_devices",
		"List online devices in the organization",
		{
			includeOffline: z
				.boolean()
				.default(false)
				.describe("Include recently offline devices"),
		},
		async (params, extra) => {
			const ctx = getContext(extra);
			const threshold = new Date(Date.now() - DEVICE_ONLINE_THRESHOLD_MS);
			const offlineThreshold = new Date(
				Date.now() - DEVICE_ONLINE_THRESHOLD_MS * 10,
			); // 10 minutes for recently offline

			const conditions = [
				eq(devicePresence.organizationId, ctx.organizationId),
			];

			if (!params.includeOffline) {
				conditions.push(gt(devicePresence.lastSeenAt, threshold));
			} else {
				conditions.push(gt(devicePresence.lastSeenAt, offlineThreshold));
			}

			const devices = await db
				.select({
					deviceId: devicePresence.deviceId,
					deviceName: devicePresence.deviceName,
					deviceType: devicePresence.deviceType,
					lastSeenAt: devicePresence.lastSeenAt,
					ownerId: devicePresence.userId,
					ownerName: users.name,
					ownerEmail: users.email,
				})
				.from(devicePresence)
				.innerJoin(users, eq(devicePresence.userId, users.id))
				.where(and(...conditions))
				.orderBy(desc(devicePresence.lastSeenAt));

			const devicesWithStatus = devices.map((d) => ({
				...d,
				isOnline: d.lastSeenAt > threshold,
			}));

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ devices: devicesWithStatus }, null, 2),
					},
				],
			};
		},
	);

	// ========================================
	// DEVICE TOOLS (Routed to Desktop)
	// ========================================

	server.tool(
		"list_workspaces",
		"List all workspaces/worktrees on a device",
		{
			deviceId: z
				.string()
				.optional()
				.describe("Target device (defaults to caller's device)"),
		},
		async (params, extra) => {
			const ctx = getContext(extra);
			const targetDeviceId = params.deviceId ?? ctx.defaultDeviceId;

			if (!targetDeviceId) {
				return {
					content: [
						{
							type: "text",
							text: "Error: No device specified and no default device configured",
						},
					],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId: targetDeviceId,
				tool: "list_workspaces",
				params: {},
			});
		},
	);

	server.tool(
		"list_projects",
		"List all projects on a device",
		{
			deviceId: z
				.string()
				.optional()
				.describe("Target device (defaults to caller's device)"),
		},
		async (params, extra) => {
			const ctx = getContext(extra);
			const targetDeviceId = params.deviceId ?? ctx.defaultDeviceId;

			if (!targetDeviceId) {
				return {
					content: [
						{
							type: "text",
							text: "Error: No device specified and no default device configured",
						},
					],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId: targetDeviceId,
				tool: "list_projects",
				params: {},
			});
		},
	);

	server.tool(
		"get_app_context",
		"Get the current app context including pathname and active workspace",
		{
			deviceId: z.string().optional(),
		},
		async (params, extra) => {
			const ctx = getContext(extra);
			const targetDeviceId = params.deviceId ?? ctx.defaultDeviceId;

			if (!targetDeviceId) {
				return {
					content: [
						{
							type: "text",
							text: "Error: No device specified and no default device configured",
						},
					],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId: targetDeviceId,
				tool: "get_app_context",
				params: {},
			});
		},
	);

	server.tool(
		"navigate_to_workspace",
		"Navigate the desktop app to a specific workspace",
		{
			deviceId: z.string().optional(),
			workspaceId: z
				.string()
				.optional()
				.describe("Workspace ID to navigate to"),
			workspaceName: z
				.string()
				.optional()
				.describe("Workspace name to navigate to"),
		},
		async (params, extra) => {
			const ctx = getContext(extra);
			const targetDeviceId = params.deviceId ?? ctx.defaultDeviceId;

			if (!targetDeviceId) {
				return {
					content: [
						{
							type: "text",
							text: "Error: No device specified and no default device configured",
						},
					],
					isError: true,
				};
			}

			if (!params.workspaceId && !params.workspaceName) {
				return {
					content: [
						{
							type: "text",
							text: "Error: Either workspaceId or workspaceName must be provided",
						},
					],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId: targetDeviceId,
				tool: "navigate_to_workspace",
				params: {
					workspaceId: params.workspaceId,
					workspaceName: params.workspaceName,
				},
			});
		},
	);

	server.tool(
		"create_workspace",
		"Create a new git worktree workspace",
		{
			deviceId: z.string().optional(),
			name: z
				.string()
				.optional()
				.describe("Workspace name (auto-generated if not provided)"),
			branchName: z
				.string()
				.optional()
				.describe("Branch name (auto-generated if not provided)"),
			baseBranch: z
				.string()
				.optional()
				.describe("Branch to create from (defaults to main)"),
			taskId: z
				.string()
				.optional()
				.describe("Task ID to associate with workspace"),
		},
		async (params, extra) => {
			const ctx = getContext(extra);
			const targetDeviceId = params.deviceId ?? ctx.defaultDeviceId;

			if (!targetDeviceId) {
				return {
					content: [
						{
							type: "text",
							text: "Error: No device specified and no default device configured",
						},
					],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId: targetDeviceId,
				tool: "create_workspace",
				params: {
					name: params.name,
					branchName: params.branchName,
					baseBranch: params.baseBranch,
				},
			});
		},
	);

	server.tool(
		"switch_workspace",
		"Switch to a different workspace",
		{
			deviceId: z.string().optional(),
			workspaceId: z
				.string()
				.uuid()
				.optional()
				.describe("Workspace ID to switch to"),
			workspaceName: z
				.string()
				.optional()
				.describe("Workspace name to switch to"),
		},
		async (params, extra) => {
			const ctx = getContext(extra);
			const targetDeviceId = params.deviceId ?? ctx.defaultDeviceId;

			if (!targetDeviceId) {
				return {
					content: [
						{
							type: "text",
							text: "Error: No device specified and no default device configured",
						},
					],
					isError: true,
				};
			}

			if (!params.workspaceId && !params.workspaceName) {
				return {
					content: [
						{
							type: "text",
							text: "Error: Either workspaceId or workspaceName must be provided",
						},
					],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId: targetDeviceId,
				tool: "switch_workspace",
				params: {
					workspaceId: params.workspaceId,
					workspaceName: params.workspaceName,
				},
			});
		},
	);

	server.tool(
		"delete_workspace",
		"Delete a workspace",
		{
			deviceId: z.string().optional(),
			workspaceId: z.string().uuid().describe("Workspace ID to delete"),
		},
		async (params, extra) => {
			const ctx = getContext(extra);
			const targetDeviceId = params.deviceId ?? ctx.defaultDeviceId;

			if (!targetDeviceId) {
				return {
					content: [
						{
							type: "text",
							text: "Error: No device specified and no default device configured",
						},
					],
					isError: true,
				};
			}

			return executeOnDevice({
				ctx,
				deviceId: targetDeviceId,
				tool: "delete_workspace",
				params: {
					workspaceId: params.workspaceId,
				},
			});
		},
	);
}

// ========================================
// DEVICE COMMAND EXECUTION
// ========================================

const POLL_INTERVAL_MS = 500;
const DEFAULT_TIMEOUT_MS = 30_000;

interface ExecuteOnDeviceParams {
	ctx: McpContext;
	deviceId: string;
	tool: string;
	params: Record<string, unknown>;
	timeout?: number;
}

async function executeOnDevice({
	ctx,
	deviceId,
	tool,
	params,
	timeout = DEFAULT_TIMEOUT_MS,
}: ExecuteOnDeviceParams): Promise<{
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
}> {
	const threshold = new Date(Date.now() - DEVICE_ONLINE_THRESHOLD_MS);

	// Check device is online
	const [device] = await db
		.select()
		.from(devicePresence)
		.where(
			and(
				eq(devicePresence.deviceId, deviceId),
				eq(devicePresence.organizationId, ctx.organizationId),
				gt(devicePresence.lastSeenAt, threshold),
			),
		)
		.limit(1);

	if (!device) {
		return {
			content: [
				{
					type: "text",
					text: `Error: Device ${deviceId} is not online or not found in this organization`,
				},
			],
			isError: true,
		};
	}

	// Create command
	const [cmd] = await db
		.insert(agentCommands)
		.values({
			userId: ctx.userId,
			organizationId: ctx.organizationId,
			targetDeviceId: deviceId,
			targetDeviceType: device.deviceType,
			tool,
			params,
			status: "pending",
			timeoutAt: new Date(Date.now() + timeout),
		})
		.returning();

	if (!cmd) {
		return {
			content: [{ type: "text", text: "Error: Failed to create command" }],
			isError: true,
		};
	}

	// Poll for result
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		const [updated] = await db
			.select()
			.from(agentCommands)
			.where(eq(agentCommands.id, cmd.id))
			.limit(1);

		if (updated?.status === "completed") {
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(updated.result ?? { success: true }, null, 2),
					},
				],
			};
		}

		if (updated?.status === "failed") {
			return {
				content: [
					{
						type: "text",
						text: `Error: ${updated.error ?? "Command failed"}`,
					},
				],
				isError: true,
			};
		}

		// Wait before next poll
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}

	// Mark as timeout
	await db
		.update(agentCommands)
		.set({ status: "timeout" })
		.where(eq(agentCommands.id, cmd.id));

	return {
		content: [
			{
				type: "text",
				text: `Error: Command timed out after ${timeout}ms. The device may be offline or busy.`,
			},
		],
		isError: true,
	};
}
