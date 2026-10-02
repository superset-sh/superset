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
	withAccountArgument,
	withoutStaleAccountArgument,
} from "./account-argument";
import type { PluginTarget } from "./resolve-target";
import { forgetUpstreamTools, upstreamTools } from "./upstream-catalog";
import { upstreamClient } from "./upstream-client";

function bare(name: string, version: string): Server {
	return new Server({ name, version }, { capabilities: { tools: {} } });
}

function needsAuthServer(
	target: Extract<PluginTarget, { kind: "needs-auth" }>,
): Server {
	const server = bare(target.plugin, "0.0.0");
	const detail = target.reason ? ` (${target.reason})` : "";
	const tool = {
		name: "authenticate",
		description: `${target.connector} is not connected${detail}. Call this to get a link for the user; the plugin's real tools appear once they finish.`,
		inputSchema: { type: "object" as const, properties: {} },
		annotations: { readOnlyHint: true },
	};

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
): Server {
	const server = bare(target.plugin, target.version);

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: target.build.getTools(),
	}));
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const checked = withoutStaleAccountArgument(
			request.params.arguments ?? {},
			target.connectionId,
		);
		if (!checked.ok) return errorResult(checked.message);
		return rejectionAware(target.connectionId, () =>
			target.build.callTool(
				request.params.name,
				checked.args,
				target.build.credential(target.secrets),
			),
		);
	});
	return server;
}

function remoteServer(
	target: Extract<PluginTarget, { kind: "remote" }>,
): Server {
	const server = bare(target.plugin, target.version);

	// Resolved inside the handler, not while building the server: the route
	// rebuilds this per request, so fetching eagerly made a tools/call open one
	// upstream session for a tool list nothing would read, then a second to
	// make the call.
	server.setRequestHandler(ListToolsRequestSchema, async () =>
		rejectionAware(target.connectionId, async () => ({
			tools: await upstreamTools(target.connectionId, target.plugin, target),
		})),
	);
	server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
		const checked = withoutStaleAccountArgument(
			request.params.arguments ?? {},
			target.connectionId,
		);
		if (!checked.ok) return errorResult(checked.message);
		return rejectionAware(target.connectionId, async () => {
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
		});
	});
	return server;
}

const LIST_TIMEOUT_MS = 10_000;

function credentialRejected(error: unknown): boolean {
	return (error as { code?: unknown } | null)?.code === 401;
}

async function recordRejection(connectionId: string): Promise<void> {
	forgetUpstreamTools(connectionId);
	await markNeedsReauth(connectionId);
}

async function rejectionAware<T>(
	connectionId: string,
	run: () => Promise<T>,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (credentialRejected(error)) await recordRejection(connectionId);
		throw error;
	}
}

function errorResult(text: string): CallToolResult {
	return { isError: true, content: [{ type: "text" as const, text }] };
}

function multiServer(target: Extract<PluginTarget, { kind: "multi" }>): Server {
	const server = new Server(
		{ name: target.plugin, version: target.version },
		{
			capabilities: { tools: {} },
			instructions: accountInstructions(
				target.connectorLabel,
				target.accounts,
				accountArgName([]),
			),
		},
	);

	type AccountTools = Tool[] | "rejected" | "unknown";

	const listFor = async (account: AccountRef): Promise<AccountTools> => {
		try {
			const resolved = await target.resolve(account.connectionId);
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
			await recordRejection(account.connectionId);
			return "rejected";
		}
	};

	const listWithin = (account: AccountRef): Promise<AccountTools> =>
		Promise.race([
			listFor(account),
			new Promise<AccountTools>((resolve) => {
				setTimeout(() => resolve("unknown"), LIST_TIMEOUT_MS).unref?.();
			}),
		]);

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
		return {
			tools: withAccountArgument(tools, accountsByTool, accountArgName(tools)),
		};
	});

	server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
		const choice = chooseAccount(
			target.connectorLabel,
			target.accounts,
			request.params.arguments ?? {},
		);
		if (!choice.ok) return errorResult(choice.message);

		const account = target.accounts.find(
			(candidate) => candidate.connectionId === choice.connectionId,
		);
		const resolved = await target.resolve(choice.connectionId);
		const label = account ? accountLabel(account) : choice.connectionId;

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
			await recordRejection(resolved.connectionId);
			const after = await target.resolve(choice.connectionId);
			return errorResult(
				after.kind === "needs-auth"
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

export async function buildPluginServer(target: PluginTarget): Promise<Server> {
	switch (target.kind) {
		case "needs-auth":
			return needsAuthServer(target);
		case "first-party":
			return firstPartyServer(target);
		case "remote":
			return remoteServer(target);
		case "multi":
			return multiServer(target);
	}
}
