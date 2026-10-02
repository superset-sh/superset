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
	server.setRequestHandler(CallToolRequestSchema, async (request) =>
		target.build.callTool(
			request.params.name,
			request.params.arguments ?? {},
			target.build.credential(target.secrets),
		),
	);
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
	server.setRequestHandler(CallToolRequestSchema, async (request, extra) =>
		rejectionAware(target.connectionId, async () => {
			const session = await upstreamClient(target);
			try {
				return await session.client.callTool(request.params, undefined, {
					signal: extra.signal,
				});
			} finally {
				await session.close();
			}
		}),
	);
	return server;
}

/** One slow account must not hold up the whole list. */
const LIST_TIMEOUT_MS = 10_000;

/**
 * 401 only. A timeout, a 500 or a rate limit means the vendor is unwell, not
 * that the credential is — and 403 is usually "not allowed to do this one
 * thing" rather than "sign in again". Marking either would send someone to
 * reconnect an account that works.
 */
function credentialRejected(error: unknown): boolean {
	return (error as { code?: unknown } | null)?.code === 401;
}

async function recordRejection(connectionId: string): Promise<void> {
	forgetUpstreamTools(connectionId);
	await markNeedsReauth(connectionId);
}

/** Any 401 from a vendor flags the connection, wherever it happened. */
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

	// "rejected" is knowledge — that account cannot serve anything, so it is not
	// offered. "unknown" is a vendor we could not reach, where assuming parity
	// beats making a working account unselectable.
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
			// needs-auth: the credential is spent, and resolve has already
			// recorded it.
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

	/**
	 * Every account's list at once, then one tool list carrying, per tool, the
	 * accounts that have it. An account whose list could not be read is offered
	 * for everything rather than dropped: a vendor blip must not make a working
	 * account unselectable.
	 */
	const gather = async (): Promise<{
		tools: Tool[];
		accountsByTool: Map<string, AccountRef[]>;
	}> => {
		// A hosted plugin's tools do not vary by account, so there is nothing to
		// compare and no credential to decrypt to find that out.
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
			// Re-resolved after the mark, so the link is the one the connector
			// actually builds rather than a guess.
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
