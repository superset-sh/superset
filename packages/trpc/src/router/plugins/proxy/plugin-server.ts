import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
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
	const credential = target.build.credential(target.secrets);

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: target.build.getTools(),
	}));
	server.setRequestHandler(CallToolRequestSchema, async (request) =>
		target.build.callTool(
			request.params.name,
			request.params.arguments ?? {},
			credential,
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

export async function buildPluginServer(target: PluginTarget): Promise<Server> {
	switch (target.kind) {
		case "needs-auth":
			return needsAuthServer(target);
		case "first-party":
			return firstPartyServer(target);
		case "remote":
			return remoteServer(target);
	}
}
