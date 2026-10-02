import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	type CallToolResult,
	ListToolsRequestSchema,
	type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
	accountArgName,
	accountInstructions,
	accountLabel,
	chooseAccount,
	withAccountArgument,
} from "./account-argument";
import type { PluginTarget } from "./resolve-target";
import { upstreamTools } from "./upstream-catalog";
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
	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: await upstreamTools(target.connectionId, target.plugin, target),
	}));
	server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
		const session = await upstreamClient(target);
		try {
			return await session.client.callTool(request.params, undefined, {
				signal: extra.signal,
			});
		} finally {
			await session.close();
		}
	});
	return server;
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

	const listTools = async (): Promise<Tool[]> => {
		let reason: string | undefined;
		for (const account of target.accounts) {
			const resolved = await target.resolve(account.connectionId);
			if (resolved.kind === "first-party") return resolved.build.getTools();
			if (resolved.kind === "remote") {
				return await upstreamTools(
					resolved.connectionId,
					resolved.plugin,
					resolved,
				);
			}
			if (resolved.kind === "needs-auth") reason = resolved.reason;
		}
		throw new Error(
			`No usable ${target.connectorLabel} account${reason ? `: ${reason}` : ""}.`,
		);
	};

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		const tools = await listTools();
		return {
			tools: withAccountArgument(tools, target.accounts, accountArgName(tools)),
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
		const result =
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
