import {
	isVoiceToolName,
	type VoiceToolInput,
	type VoiceToolName,
	type VoiceToolResult,
	type VoiceUiDirective,
	voiceTool,
} from "@superset/shared/voice";
import { ago } from "./ago";
import { resolveSession, resolveWorkspace } from "./resolveWorkspace";
import {
	type VoiceData,
	VoiceDataError,
	type VoicePage,
	type VoicePullRequest,
	type VoiceSessionRow,
	type VoiceWorkspace,
} from "./types";

export interface ToolContext {
	data: VoiceData;
	now: () => number;
	endSession: () => void;
	getPathname: () => string;
	/** Speak up when this agent session finishes or needs the user. */
	watchSession: (workspace: VoiceWorkspace, terminalId: string) => void;
}

const WRITE_TOOLS: ReadonlySet<string> = new Set([
	"send_message",
	"start_agent",
	"stop_agent",
	"create_workspace",
	"restart_workspace",
	"create_task",
]);

/** No call may leave the model, and the user, waiting on it for longer. */
const TOOL_TIMEOUT_MS = 20_000;

/** A day without activity and a workspace is no longer "active". */
const ACTIVE_WINDOW_MS = 24 * 60 * 60_000;

const ATTENTION_WORDS: Record<
	NonNullable<VoiceWorkspace["attention"]>,
	string
> = {
	working: "working",
	review: "finished, waiting for the user to look",
	permission: "waiting for permission",
	failed: "failed",
};

class ToolFailure extends Error {
	constructor(
		readonly kind: string,
		message: string,
		readonly extra: Record<string, unknown> = {},
	) {
		super(message);
	}
}

function describeWorkspace(workspace: VoiceWorkspace, now: number) {
	return {
		name: workspace.name,
		project: workspace.project,
		branch: workspace.branch,
		where:
			workspace.kind === "cloud"
				? "cloud"
				: (workspace.hostName ?? "a machine"),
		...(workspace.status !== "ready" ? { status: workspace.status } : {}),
		agent: workspace.attention ? ATTENTION_WORDS[workspace.attention] : "idle",
		since: ago(workspace.attentionAt ?? workspace.lastActivityAt, now),
	};
}

function describeSession(session: VoiceSessionRow, now: number) {
	return {
		name: session.title,
		agent: session.agentId,
		state: session.attention ? ATTENTION_WORDS[session.attention] : "idle",
		since: ago(session.lastEventAt ?? session.createdAt, now),
	};
}

function describePullRequest(pr: VoicePullRequest) {
	return {
		number: pr.number,
		title: pr.title,
		state: pr.state,
		current: pr.isCurrent,
	};
}

function describePage(page: VoicePage, now: number) {
	return {
		slug: page.slug,
		title: page.title,
		description: page.description,
		updated: ago(page.updatedAt, now),
	};
}

const recency = (workspace: VoiceWorkspace) =>
	workspace.attentionAt ?? workspace.lastActivityAt ?? 0;

async function requireWorkspace(
	query: string,
	ctx: ToolContext,
): Promise<VoiceWorkspace> {
	const resolution = resolveWorkspace(query, await ctx.data.listWorkspaces());
	switch (resolution.kind) {
		case "match":
			return resolution.workspace;
		case "ambiguous":
			throw new ToolFailure(
				"ambiguous",
				`Several workspaces match "${query}".`,
				{
					candidates: resolution.candidates.map((workspace) => workspace.name),
				},
			);
		case "none":
			throw new ToolFailure("not_found", `No workspace matches "${query}".`);
	}
}

/** One row by spoken name: the only one, an exact match, or the only partial match. */
function pickByName<Row extends { name: string }>(
	rows: Row[],
	wanted: string | undefined,
	what: string,
	noneMessage: string,
): Row {
	if (rows.length === 0) throw new ToolFailure("invalid", noneMessage);
	const query = wanted?.trim().toLowerCase();
	const matches = query
		? rows.filter((row) => row.name.toLowerCase().includes(query))
		: rows;
	const picked =
		matches.find((row) => row.name.toLowerCase() === query) ??
		(matches.length === 1 ? matches[0] : undefined);
	if (picked) return picked;
	throw new ToolFailure(
		"ambiguous",
		query && matches.length === 0
			? `No ${what} matches "${wanted}".`
			: `Several ${what}s; ask which one.`,
		{
			[`${what}s`]: (matches.length > 0 ? matches : rows).map(
				(row) => row.name,
			),
		},
	);
}

async function requireSession(
	workspace: VoiceWorkspace,
	query: string | undefined,
	ctx: ToolContext,
): Promise<VoiceSessionRow> {
	const sessions = await ctx.data.listSessions(workspace);
	const session = resolveSession(query, sessions);
	if (!session) {
		throw new ToolFailure(
			"not_found",
			query
				? `No session called "${query}" in ${workspace.name}.`
				: `${workspace.name} has no running sessions.`,
			{ sessions: sessions.map((row) => describeSession(row, ctx.now())) },
		);
	}
	return session;
}

async function settle<Value>(
	promise: Promise<Value>,
): Promise<{ value: Value } | { error: string }> {
	try {
		return { value: await promise };
	} catch (error) {
		return { error: error instanceof Error ? error.message : "failed" };
	}
}

type Handlers = {
	[Name in VoiceToolName]: (
		args: VoiceToolInput<Name>,
		ctx: ToolContext,
	) => Promise<VoiceToolResult>;
};

const handlers: Handlers = {
	async list_workspaces(args, ctx) {
		const now = ctx.now();
		const all = await ctx.data.listWorkspaces();
		const matching =
			args.filter === "all"
				? all
				: all.filter(
						(workspace) =>
							workspace.attention !== null ||
							workspace.status === "provisioning" ||
							(workspace.lastActivityAt !== null &&
								now - workspace.lastActivityAt < ACTIVE_WINDOW_MS),
					);
		const listed = [...matching]
			.sort((left, right) => recency(right) - recency(left))
			.slice(0, args.limit);
		return {
			output: {
				workspaces: listed.map((workspace) =>
					describeWorkspace(workspace, now),
				),
				shown: listed.length,
				matching: matching.length,
				total: all.length,
			},
			ui: {
				navigate: { screen: "home" },
				highlightWorkspaceIds: listed.map((workspace) => workspace.id),
			},
		};
	},

	async get_workspace(args, ctx) {
		const now = ctx.now();
		const workspace = await requireWorkspace(args.query, ctx);
		const [sessions, pullRequests] = await Promise.all([
			settle(ctx.data.listSessions(workspace)),
			settle(ctx.data.listPullRequests(workspace)),
		]);
		return {
			output: {
				workspace: describeWorkspace(workspace, now),
				sessions:
					"value" in sessions
						? sessions.value.map((row) => describeSession(row, now))
						: { error: sessions.error },
				pullRequests:
					"value" in pullRequests
						? pullRequests.value.map(describePullRequest)
						: { error: pullRequests.error },
			},
			ui: {
				navigate: { screen: "workspace", workspaceId: workspace.id },
				highlightWorkspaceIds: [workspace.id],
			},
		};
	},

	async list_sessions(args, ctx) {
		const workspace = await requireWorkspace(args.workspace, ctx);
		const sessions = await ctx.data.listSessions(workspace);
		return {
			output: {
				workspace: workspace.name,
				sessions: sessions.map((row) => describeSession(row, ctx.now())),
			},
			ui: { navigate: { screen: "sessions", workspaceId: workspace.id } },
		};
	},

	async read_session(args, ctx) {
		const workspace = await requireWorkspace(args.workspace, ctx);
		const session = await requireSession(workspace, args.session, ctx);
		const transcript = await ctx.data.readTranscript(
			workspace,
			session,
			args.maxChars,
		);
		return {
			output: {
				workspace: workspace.name,
				session: describeSession(session, ctx.now()),
				transcript,
			},
			ui: {
				navigate: {
					screen: "workspace",
					workspaceId: workspace.id,
					terminalId: session.terminalId,
				},
			},
		};
	},

	async list_pull_requests(args, ctx) {
		const workspace = await requireWorkspace(args.workspace, ctx);
		const pullRequests = await ctx.data.listPullRequests(workspace);
		return {
			output: {
				workspace: workspace.name,
				pullRequests: pullRequests.map(describePullRequest),
			},
			ui: {
				navigate:
					pullRequests.length > 0
						? { screen: "pull_requests", workspaceId: workspace.id }
						: { screen: "workspace", workspaceId: workspace.id },
			},
		};
	},

	async list_pages(args, ctx) {
		const workspace = args.workspace
			? await requireWorkspace(args.workspace, ctx)
			: null;
		const pages = await ctx.data.listPages(workspace?.id ?? null, args.limit);
		return {
			output: {
				...(workspace ? { workspace: workspace.name } : {}),
				pages: pages.map((page) => describePage(page, ctx.now())),
			},
		};
	},

	async open_page(args, ctx) {
		const page = await ctx.data.findPage(args.page);
		if (!page)
			throw new ToolFailure("not_found", `No page matches "${args.page}".`);
		return {
			output: { page: describePage(page, ctx.now()), opened: true },
			ui: { navigate: { screen: "page", slug: page.slug } },
		};
	},

	async read_page(args, ctx) {
		const onScreen = /^\/pages\/([^/]+)/.exec(ctx.getPathname())?.[1];
		const query = args.page ?? (onScreen && decodeURIComponent(onScreen));
		if (!query) {
			throw new ToolFailure("invalid", "No page is open; say which page.");
		}
		const page = await ctx.data.findPage(query);
		if (!page)
			throw new ToolFailure("not_found", `No page matches "${query}".`);
		return {
			output: {
				page: describePage(page, ctx.now()),
				text: await ctx.data.readPage(page, args.maxChars),
			},
			ui: { navigate: { screen: "page", slug: page.slug } },
		};
	},

	async show(args, ctx) {
		let navigate: VoiceUiDirective["navigate"];
		switch (args.screen) {
			case "home":
				navigate = { screen: "home" };
				break;
			case "page": {
				if (!args.page) throw new ToolFailure("invalid", "show needs a page.");
				const page = await ctx.data.findPage(args.page);
				if (!page)
					throw new ToolFailure("not_found", `No page matches "${args.page}".`);
				navigate = { screen: "page", slug: page.slug };
				break;
			}
			default: {
				if (!args.workspace) {
					throw new ToolFailure("invalid", "show needs a workspace.");
				}
				const workspace = await requireWorkspace(args.workspace, ctx);
				navigate = { screen: args.screen, workspaceId: workspace.id };
			}
		}
		return { output: { shown: args.screen }, ui: { navigate } };
	},

	async create_workspace(args, ctx) {
		const prompt = args.prompt.trim();
		if (args.cloud) {
			const environment = pickByName(
				await ctx.data.listEnvironments(),
				args.environment,
				"environment",
				"No environment with a repository exists; one is set up in Settings on the desktop.",
			);
			const workspace = await ctx.data.createWorkspace({
				environmentId: environment.id,
				prompt,
				agent: args.agent,
			});
			return {
				output: {
					created: true,
					workspace: workspace.name,
					where: "cloud",
					environment: environment.name,
				},
				ui: { navigate: { screen: "workspace", workspaceId: workspace.id } },
			};
		}
		const machine = pickByName(
			await ctx.data.listMachines(),
			args.machine,
			"machine",
			"None of the user's machines is reachable right now.",
		);
		const project = args.project
			? pickByName(
					machine.projects,
					args.project,
					"project",
					`${machine.name} has no projects.`,
				)
			: null;
		const { workspace, terminalId } = await ctx.data.createMachineWorkspace({
			machine,
			projectId: project?.id ?? null,
			prompt,
			agent: args.agent,
		});
		if (terminalId) ctx.watchSession(workspace, terminalId);
		return {
			output: {
				created: true,
				workspace: workspace.name,
				where: machine.name,
				...(project ? { project: project.name } : {}),
				agentStarted: terminalId !== null,
			},
			ui: {
				navigate: {
					screen: "workspace",
					workspaceId: workspace.id,
					...(terminalId ? { terminalId } : {}),
				},
			},
		};
	},

	async start_agent(args, ctx) {
		const workspace = await requireWorkspace(args.workspace, ctx);
		const started = await ctx.data.startAgent(
			workspace,
			args.agent,
			args.prompt.trim(),
		);
		ctx.watchSession(workspace, started.terminalId);
		return {
			output: {
				started: true,
				workspace: workspace.name,
				session: started.label,
			},
			ui: {
				navigate: {
					screen: "workspace",
					workspaceId: workspace.id,
					terminalId: started.terminalId,
				},
			},
		};
	},

	async stop_agent(args, ctx) {
		const workspace = await requireWorkspace(args.workspace, ctx);
		const session = await requireSession(workspace, args.session, ctx);
		await ctx.data.stopSession(workspace, session);
		return {
			output: {
				stopped: true,
				workspace: workspace.name,
				session: session.title,
			},
			ui: { navigate: { screen: "workspace", workspaceId: workspace.id } },
		};
	},

	async create_task(args, ctx) {
		const task = await ctx.data.createTask({
			title: args.title.trim(),
			description: args.description?.trim() || undefined,
			priority: args.priority,
		});
		return { output: { created: true, task } };
	},

	async list_tasks(args, ctx) {
		const tasks = await ctx.data.listTasks(args);
		return { output: { tasks } };
	},

	async end_session(_args, ctx) {
		ctx.endSession();
		return { output: { ending: true } };
	},

	async send_message(args, ctx) {
		const workspace = await requireWorkspace(args.workspace, ctx);
		const session = await requireSession(workspace, args.session, ctx);
		await ctx.data.sendMessage(workspace, session, args.text.trim());
		return {
			output: {
				sent: true,
				workspace: workspace.name,
				session: session.title,
			},
			ui: {
				navigate: {
					screen: "workspace",
					workspaceId: workspace.id,
					terminalId: session.terminalId,
				},
			},
		};
	},

	async restart_workspace(args, ctx) {
		const workspace = await requireWorkspace(args.workspace, ctx);
		if (workspace.kind !== "cloud") {
			throw new ToolFailure(
				"invalid",
				`${workspace.name} runs on ${workspace.hostName ?? "a machine"}; only cloud workspaces restart.`,
			);
		}
		await ctx.data.restartWorkspace(workspace);
		return {
			output: { restarted: true, workspace: workspace.name },
			ui: { navigate: { screen: "workspace", workspaceId: workspace.id } },
		};
	},
};

/**
 * Runs one of the model's function calls. Never throws: a failure becomes an
 * `error` the model can say out loud, with a `kind` it can act on.
 */
export async function executeTool(
	name: string,
	rawArgs: unknown,
	ctx: ToolContext,
): Promise<VoiceToolResult> {
	if (!isVoiceToolName(name)) {
		return { output: { error: { kind: "unknown_tool", message: name } } };
	}
	const parsed = voiceTool(name).parameters.safeParse(rawArgs ?? {});
	if (!parsed.success) {
		return {
			output: {
				error: { kind: "invalid_arguments", message: parsed.error.message },
			},
		};
	}
	try {
		const handler = handlers[name] as (
			args: unknown,
			ctx: ToolContext,
		) => Promise<VoiceToolResult>;
		return await Promise.race([
			handler(parsed.data, ctx),
			new Promise<never>((_resolve, reject) =>
				setTimeout(
					() =>
						reject(
							WRITE_TOOLS.has(name)
								? new ToolFailure(
										"outcome_unknown",
										"That did not answer, so it may or may not have gone through. Do not try again; tell the user and let them check.",
									)
								: new ToolFailure("timeout", "That took too long."),
						),
					TOOL_TIMEOUT_MS,
				),
			),
		]);
	} catch (error) {
		if (error instanceof ToolFailure) {
			return {
				output: {
					error: { kind: error.kind, message: error.message, ...error.extra },
				},
			};
		}
		if (error instanceof VoiceDataError) {
			return {
				output: { error: { kind: error.kind, message: error.message } },
			};
		}
		return {
			output: {
				error: {
					kind: "failed",
					message: error instanceof Error ? error.message : "Something failed.",
				},
			},
		};
	}
}

/** The thing a tool acted on, for the transcript row; null when it has none. */
export function toolSubject(rawArgs: unknown): string | null {
	if (typeof rawArgs !== "object" || rawArgs === null) return null;
	const args = rawArgs as Record<string, unknown>;
	const value = args.workspace ?? args.query ?? args.page ?? args.screen;
	return typeof value === "string" ? value : null;
}
