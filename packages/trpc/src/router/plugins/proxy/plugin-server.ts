import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	type CallToolResult,
	ListToolsRequestSchema,
	type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { markNeedsReauth } from "../../../lib/connectors/refresh";
import type { AccountRef } from "./account-argument";
import {
	accountArgName,
	accountInstructions,
	accountLabel,
	chooseAccount,
	hasAccountArgument,
	toolProperties,
	withAccountArgument,
	withoutStaleAccountArgument,
} from "./account-argument";
import {
	type PluginTarget,
	PluginTargetError,
	targetKey,
} from "./resolve-target";
import { forgetUpstreamTools, upstreamTools } from "./upstream-catalog";
import { upstreamClient } from "./upstream-client";

function authenticateTool(problem: string): Tool {
	return {
		name: "authenticate",
		description: `${problem}. Call this to get a link for the user; the plugin's real tools appear once they finish.`,
		inputSchema: { type: "object" as const, properties: {} },
		annotations: { readOnlyHint: true },
	};
}

function bare(name: string, version: string): Server {
	return new Server({ name, version }, { capabilities: { tools: {} } });
}

function needsAuthServer(
	target: Extract<PluginTarget, { kind: "needs-auth" }>,
): Server {
	const server = bare(target.plugin, "0.0.0");
	const detail = target.reason ? ` (${target.reason})` : "";
	const tool = authenticateTool(
		`${target.connector} is not connected${detail}`,
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: [tool],
	}));
	server.setRequestHandler(CallToolRequestSchema, async () => ({
		isError: true,
		content: [
			{
				type: "text" as const,
				text: `Ask the user to open ${target.connectUrl} and authorize ${target.connector}, then retry.`,
			},
		],
	}));
	return server;
}

function firstPartyServer(
	target: Extract<PluginTarget, { kind: "first-party" }>,
	recordRejection: RecordRejection,
): Server {
	const server = bare(target.plugin, target.version);

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: target.build.getTools(),
	}));
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const checked = withoutStaleAccountArgument(
			request.params.arguments ?? {},
			accountNames(target),
			toolProperties(target.build.getTools(), request.params.name),
		);
		if (!checked.ok) return errorResult(checked.message);
		try {
			return await target.build.callTool(
				request.params.name,
				checked.args,
				target.build.credential(target.secrets),
			);
		} catch (error) {
			if (!credentialRejected(error)) throw error;
			await recordRejection(target.connectionId, target.storedAccessToken);
			return errorResult(
				`${target.plugin} rejected this account's credential. Ask the user to reconnect it, then retry.`,
			);
		}
	});
	return server;
}

function remoteServer(
	target: Extract<PluginTarget, { kind: "remote" }>,
	recordRejection: RecordRejection,
): Server {
	const server = bare(target.plugin, target.version);

	// Resolved inside the handler, not while building the server: the route
	// rebuilds this per request, so fetching eagerly made a tools/call open one
	// upstream session for a tool list nothing would read, then a second to
	// make the call.
	server.setRequestHandler(ListToolsRequestSchema, async () =>
		rejectionAware(target, recordRejection, async () => ({
			tools: await upstreamTools(target.connectionId, target.plugin, target),
		})),
	);
	server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
		const args = request.params.arguments ?? {};
		const checked = withoutStaleAccountArgument(
			args,
			accountNames(target),
			hasAccountArgument(args)
				? await vendorProperties(target, request.params.name)
				: new Set(),
		);
		if (!checked.ok) return errorResult(checked.message);
		try {
			const session = await upstreamClient(target);
			try {
				return await session.client.callTool(
					{ ...request.params, arguments: checked.args },
					undefined,
					{ signal: extra.signal },
				);
			} finally {
				await session.close();
			}
		} catch (error) {
			if (!credentialRejected(error)) throw error;
			await recordRejection(target.connectionId, target.storedAccessToken);
			return errorResult(
				`${target.plugin} rejected this account's credential. Ask the user to reconnect it, then retry.`,
			);
		}
	});
	return server;
}

const LIST_TIMEOUT_MS = 10_000;
const LAYOUT_TTL_MS = 5 * 60_000;

interface AccountLayout {
	argName: string;
	accountsByTool: Map<string, string[]>;
	at: number;
}

const layouts = new Map<string, AccountLayout>();

function layoutKey(target: Extract<PluginTarget, { kind: "multi" }>): string {
	return `${target.plugin}@${target.version}:${targetKey(target)}`;
}

function cachedLayout(
	target: Extract<PluginTarget, { kind: "multi" }>,
): AccountLayout | null {
	const layout = layouts.get(layoutKey(target));
	return layout && Date.now() - layout.at < LAYOUT_TTL_MS ? layout : null;
}

function rememberLayout(
	target: Extract<PluginTarget, { kind: "multi" }>,
	argName: string,
	accountsByTool: ReadonlyMap<string, readonly AccountRef[]>,
): AccountLayout {
	const now = Date.now();
	for (const [key, layout] of layouts) {
		if (now - layout.at >= LAYOUT_TTL_MS) layouts.delete(key);
	}
	const layout: AccountLayout = {
		argName,
		accountsByTool: new Map(
			[...accountsByTool].map(([tool, accounts]) => [
				tool,
				accounts.map((account) => account.connectionId),
			]),
		),
		at: now,
	};
	layouts.set(layoutKey(target), layout);
	return layout;
}

async function vendorProperties(
	target: Extract<PluginTarget, { kind: "remote" }>,
	tool: string,
): Promise<Set<string>> {
	try {
		return toolProperties(
			await upstreamTools(target.connectionId, target.plugin, target),
			tool,
		);
	} catch {
		return new Set();
	}
}

function accountNames(target: {
	connectionId: string;
	account?: AccountRef;
}): string[] {
	const account = target.account;
	return [
		target.connectionId,
		...(account
			? [account.userLabel, account.accountLabel, accountLabel(account)]
			: []),
	].filter((name): name is string => Boolean(name));
}

function credentialRejected(error: unknown): boolean {
	return (error as { code?: unknown } | null)?.code === 401;
}

type RecordRejection = (
	connectionId: string,
	storedAccessToken: string | undefined,
) => Promise<void>;

async function markRejected(
	connectionId: string,
	storedAccessToken: string | undefined,
): Promise<void> {
	forgetUpstreamTools(connectionId);
	await markNeedsReauth(connectionId, storedAccessToken);
}

async function rejectionAware<T>(
	target: { connectionId: string; storedAccessToken?: string },
	recordRejection: RecordRejection,
	run: () => Promise<T>,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (credentialRejected(error))
			await recordRejection(target.connectionId, target.storedAccessToken);
		throw error;
	}
}

function errorResult(text: string): CallToolResult {
	return { isError: true, content: [{ type: "text" as const, text }] };
}

function multiServer(
	target: Extract<PluginTarget, { kind: "multi" }>,
	recordRejection: RecordRejection,
): Server {
	const server = new Server(
		{ name: target.plugin, version: target.version },
		{
			capabilities: { tools: {} },
			instructions: accountInstructions(target.connectorLabel, target.accounts),
		},
	);

	type AccountTools = Tool[] | "rejected" | "unknown";

	const listFor = async (account: AccountRef): Promise<AccountTools> => {
		let resolved: PluginTarget | undefined;
		try {
			resolved = await target.resolve(account.connectionId);
			if (resolved.kind === "first-party") return resolved.build.getTools();
			if (resolved.kind === "remote") {
				return await upstreamTools(
					resolved.connectionId,
					resolved.plugin,
					resolved,
				);
			}
			return "rejected";
		} catch (error) {
			if (!credentialRejected(error)) return "unknown";
			await recordRejection(
				account.connectionId,
				resolved && "storedAccessToken" in resolved
					? resolved.storedAccessToken
					: undefined,
			);
			return "rejected";
		}
	};

	const reconnectLinks = async (): Promise<string> => {
		const lines = await Promise.all(
			target.accounts.map(async (account) => {
				const resolved = await target
					.resolve(account.connectionId)
					.catch(() => null);
				const link =
					resolved?.kind === "needs-auth" ? resolved.connectUrl : null;
				return link
					? `${accountLabel(account)}: ${link}`
					: accountLabel(account);
			}),
		);
		return lines.join("; ");
	};

	const listWithin = async (account: AccountRef): Promise<AccountTools> => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				listFor(account),
				new Promise<AccountTools>((resolve) => {
					timer = setTimeout(() => resolve("unknown"), LIST_TIMEOUT_MS);
				}),
			]);
		} finally {
			clearTimeout(timer);
		}
	};

	const gather = async (): Promise<{
		tools: Tool[];
		accountsByTool: Map<string, AccountRef[]>;
	}> => {
		if (target.hosted) {
			const tools = target.hosted.getTools();
			return {
				tools,
				accountsByTool: new Map(
					tools.map((tool) => [tool.name, [...target.accounts]]),
				),
			};
		}

		const lists = await Promise.all(target.accounts.map(listWithin));
		if (lists.every((list) => list === "rejected")) {
			return {
				tools: [
					authenticateTool(
						`Every ${target.connectorLabel} account needs to be reconnected`,
					),
				],
				accountsByTool: new Map(),
			};
		}
		if (lists.every((list) => typeof list === "string")) {
			throw new Error(`No usable ${target.connectorLabel} account.`);
		}

		const definitions = new Map<string, Tool>();
		const accountsByTool = new Map<string, AccountRef[]>();
		lists.forEach((list, index) => {
			const account = target.accounts[index];
			if (typeof list === "string" || !account) return;
			for (const tool of list) {
				if (!definitions.has(tool.name)) definitions.set(tool.name, tool);
				accountsByTool.set(tool.name, [
					...(accountsByTool.get(tool.name) ?? []),
					account,
				]);
			}
		});

		const unreadable = target.accounts.filter(
			(_, index) => lists[index] === "unknown",
		);
		for (const [name, accounts] of accountsByTool) {
			accountsByTool.set(
				name,
				[...accounts, ...unreadable].sort((a, b) =>
					a.connectionId.localeCompare(b.connectionId),
				),
			);
		}

		return { tools: [...definitions.values()], accountsByTool };
	};

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		const { tools, accountsByTool } = await gather();
		const argName = accountArgName(tools);
		rememberLayout(target, argName, accountsByTool);
		return { tools: withAccountArgument(tools, accountsByTool, argName) };
	});

	const layoutForCall = async (): Promise<AccountLayout | null> => {
		const cached = cachedLayout(target);
		if (cached) return cached;
		try {
			const { tools, accountsByTool } = await gather();
			return rememberLayout(target, accountArgName(tools), accountsByTool);
		} catch {
			return null;
		}
	};

	server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
		const layout = await layoutForCall();
		if (
			layout?.accountsByTool.size === 0 &&
			request.params.name === "authenticate"
		) {
			return errorResult(
				`Ask the user to reconnect each ${target.connectorLabel} account, then retry: ${await reconnectLinks()}.`,
			);
		}
		const choice = chooseAccount(
			target.connectorLabel,
			target.accounts,
			request.params.arguments ?? {},
			layout?.argName ?? accountArgName(target.hosted?.getTools() ?? []),
		);
		if (!choice.ok) return errorResult(choice.message);

		const account = target.accounts.find(
			(candidate) => candidate.connectionId === choice.connectionId,
		);
		const label = account ? accountLabel(account) : choice.connectionId;
		let resolved: PluginTarget;
		try {
			resolved = await target.resolve(choice.connectionId);
		} catch (error) {
			if (!(error instanceof PluginTargetError)) throw error;
			return errorResult(
				`${target.connectorLabel} could not be reached for ${label}: ${error.message}`,
			);
		}

		if (resolved.kind === "needs-auth") {
			return errorResult(
				`${label} needs to be reconnected. Ask the user to open ${resolved.connectUrl} then retry.`,
			);
		}
		if (resolved.kind === "multi") {
			return errorResult(
				`${label} did not resolve to a single ${target.connectorLabel} account.`,
			);
		}
		const offering = layout?.accountsByTool.get(request.params.name);
		if (offering && !offering.includes(choice.connectionId)) {
			const names = target.accounts
				.filter((candidate) => offering.includes(candidate.connectionId))
				.map(accountLabel)
				.join(", ");
			return errorResult(
				`${label} does not offer ${request.params.name}. Accounts that do: ${names}.`,
			);
		}

		const params = { ...request.params, arguments: choice.rest };
		let result: CallToolResult;
		try {
			result =
				resolved.kind === "first-party"
					? await resolved.build.callTool(
							params.name,
							choice.rest,
							resolved.build.credential(resolved.secrets),
						)
					: await (async () => {
							const session = await upstreamClient(resolved);
							try {
								return (await session.client.callTool(params, undefined, {
									signal: extra.signal,
								})) as CallToolResult;
							} finally {
								await session.close();
							}
						})();
		} catch (error) {
			if (!credentialRejected(error)) throw error;
			layouts.delete(layoutKey(target));
			await recordRejection(resolved.connectionId, resolved.storedAccessToken);
			const after = await target.resolve(choice.connectionId).catch(() => null);
			return errorResult(
				after?.kind === "needs-auth"
					? `${target.connectorLabel} rejected ${label}. Ask the user to open ${after.connectUrl} to reconnect it, then retry.`
					: `${target.connectorLabel} rejected ${label}. Ask the user to reconnect it, then retry.`,
			);
		}

		return {
			...result,
			content: [
				...(Array.isArray(result.content) ? result.content : []),
				{ type: "text" as const, text: `(acted as ${label})` },
			],
			_meta: { ...(result._meta ?? {}), superset_account: choice.connectionId },
		};
	});

	return server;
}

export async function buildPluginServer(
	target: PluginTarget,
	recordRejection: RecordRejection = markRejected,
): Promise<Server> {
	switch (target.kind) {
		case "needs-auth":
			return needsAuthServer(target);
		case "first-party":
			return firstPartyServer(target, recordRejection);
		case "remote":
			return remoteServer(target, recordRejection);
		case "multi":
			return multiServer(target, recordRejection);
	}
}
