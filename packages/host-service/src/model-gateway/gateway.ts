import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import {
	type ModelProviderProtocol,
	modelProviders,
	workspaceAgentModelConfigs,
} from "../db/schema";
import { decodeProviderModelRef } from "../model-providers/model-ref";
import { appendProviderPath } from "../model-providers/provider-url";
import { getModelProvider } from "../model-providers/storage";
import {
	type AnthropicMessageBody,
	buildAnthropicResponseFromUpstream,
	buildAnthropicSseFromMessage,
	buildOpenAIChatRequest,
	buildOpenAIResponsesRequest,
	resolveUpstreamModelId,
} from "./translation";

type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

interface GatewayRequestOptions {
	db: HostDb;
	request: Request;
	fetchImpl?: FetchLike;
	internalToken?: string;
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function extractBearer(value: string | null): string | null {
	if (!value) return null;
	return value.toLowerCase().startsWith("bearer ") ? value.slice(7) : value;
}

function getRequestToken(request: Request): string | null {
	return (
		extractBearer(request.headers.get("authorization")) ??
		request.headers.get("x-api-key")
	);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectConfigByToken(
	db: HostDb,
	token: string,
	internalToken?: string,
):
	| {
			kind: "workspace";
			providerId: string;
			modelIds: string[];
	  }
	| { kind: "internal" }
	| null {
	if (internalToken && token === internalToken) return { kind: "internal" };
	const row = db
		.select()
		.from(workspaceAgentModelConfigs)
		.where(eq(workspaceAgentModelConfigs.gatewayToken, token))
		.get();
	if (!row) return null;
	return {
		kind: "workspace",
		providerId: row.providerId,
		modelIds: [row.haikuModelId, row.sonnetModelId, row.opusModelId],
	};
}

function resolveProviderForRequest(args: {
	db: HostDb;
	auth:
		| {
				kind: "workspace";
				providerId: string;
				modelIds: string[];
		  }
		| { kind: "internal" };
	requestModel: string;
}) {
	const decoded = decodeProviderModelRef(args.requestModel);
	if (decoded) {
		if (
			args.auth.kind === "workspace" &&
			(decoded.providerId !== args.auth.providerId ||
				!args.auth.modelIds.includes(decoded.modelId))
		) {
			return null;
		}
		const provider = getModelProvider(args.db, decoded.providerId);
		if (!provider?.enabled) return null;
		return { provider, upstreamModelId: decoded.modelId };
	}

	if (args.auth.kind === "workspace") {
		if (!args.auth.modelIds.includes(args.requestModel)) return null;
		const provider = getModelProvider(args.db, args.auth.providerId);
		if (!provider?.enabled) return null;
		return { provider, upstreamModelId: args.requestModel };
	}

	const provider = args.db
		.select()
		.from(modelProviders)
		.where(eq(modelProviders.enabled, true))
		.all()
		.map((row) => getModelProvider(args.db, row.id))
		.find((item) =>
			item?.models.some(
				(model) => model.enabled && model.modelId === args.requestModel,
			),
		);
	if (!provider) return null;
	return { provider, upstreamModelId: args.requestModel };
}

function responseHeadersForJson(stream: boolean): Record<string, string> {
	if (!stream) return { "content-type": "application/json" };
	return {
		"content-type": "text/event-stream",
		"cache-control": "no-cache",
		connection: "keep-alive",
	};
}

function matchesGatewayEndpoint(pathname: string, endpoint: string): boolean {
	const normalizedPathname = pathname.toLowerCase().replace(/\/+$/, "");
	const normalizedEndpoint = endpoint.toLowerCase().replace(/^\/+/, "");
	return (
		normalizedPathname.endsWith(`/v1/${normalizedEndpoint}`) ||
		normalizedPathname.endsWith(`/${normalizedEndpoint}`)
	);
}

async function forwardAnthropic(args: {
	provider: NonNullable<ReturnType<typeof getModelProvider>>;
	body: AnthropicMessageBody;
	fetchImpl: FetchLike;
}): Promise<Response> {
	if (!args.provider.secret) {
		return jsonResponse(400, {
			error: { message: "Provider secret is missing" },
		});
	}
	const upstreamBody = {
		...args.body,
		model: resolveUpstreamModelId(args.body.model),
	};
	let upstream: Response;
	try {
		upstream = await args.fetchImpl(
			appendProviderPath(args.provider.baseUrl, "/v1/messages"),
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-api-key": args.provider.secret,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify(upstreamBody),
			},
		);
	} catch {
		return jsonResponse(502, {
			error: {
				message:
					"Model provider request failed before receiving a response. Check the provider URL, protocol, and network.",
			},
		});
	}
	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			"content-type":
				upstream.headers.get("content-type") ??
				responseHeadersForJson(args.body.stream === true)["content-type"],
		},
	});
}

function upstreamPath(protocol: ModelProviderProtocol): string {
	if (protocol === "openai-chat") return "/v1/chat/completions";
	if (protocol === "openai-responses") return "/v1/responses";
	return "/v1/messages";
}

async function forwardTranslated(args: {
	protocol: Exclude<ModelProviderProtocol, "anthropic">;
	provider: NonNullable<ReturnType<typeof getModelProvider>>;
	body: AnthropicMessageBody;
	fetchImpl: FetchLike;
}): Promise<Response> {
	if (!args.provider.secret) {
		return jsonResponse(400, {
			error: { message: "Provider secret is missing" },
		});
	}
	const upstreamBody =
		args.protocol === "openai-chat"
			? buildOpenAIChatRequest(args.body)
			: buildOpenAIResponsesRequest(args.body);
	let upstream: Response;
	try {
		upstream = await args.fetchImpl(
			appendProviderPath(args.provider.baseUrl, upstreamPath(args.protocol)),
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${args.provider.secret}`,
				},
				body: JSON.stringify(upstreamBody),
			},
		);
	} catch {
		return jsonResponse(502, {
			error: {
				message:
					"Model provider request failed before receiving a response. Check the provider URL, protocol, and network.",
			},
		});
	}
	const text = await upstream.text();
	if (!upstream.ok) {
		return new Response(text, {
			status: upstream.status,
			headers: { "content-type": "application/json" },
		});
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		return jsonResponse(502, {
			error: { message: "Upstream provider returned invalid JSON" },
		});
	}
	const message = buildAnthropicResponseFromUpstream({
		protocol: args.protocol,
		requestModel: args.body.model,
		upstream: parsed,
	});
	if (args.body.stream === true) {
		return new Response(buildAnthropicSseFromMessage(message), {
			status: 200,
			headers: responseHeadersForJson(true),
		});
	}
	return jsonResponse(200, message);
}

export async function handleModelGatewayRequest({
	db,
	request,
	fetchImpl = fetch,
	internalToken,
}: GatewayRequestOptions): Promise<Response> {
	const token = getRequestToken(request);
	if (!token) return jsonResponse(401, { error: { message: "Unauthorized" } });
	const auth = selectConfigByToken(db, token, internalToken);
	if (!auth) return jsonResponse(401, { error: { message: "Unauthorized" } });

	const url = new URL(request.url);
	if (
		request.method === "GET" &&
		matchesGatewayEndpoint(url.pathname, "models")
	) {
		const modelIds =
			auth.kind === "workspace"
				? auth.modelIds
				: db
						.select()
						.from(modelProviders)
						.where(eq(modelProviders.enabled, true))
						.all()
						.flatMap(
							(provider) =>
								getModelProvider(db, provider.id)
									?.models.filter((model) => model.enabled)
									.map((model) => model.modelId) ?? [],
						);
		return jsonResponse(200, {
			data: [...new Set(modelIds)].map((id) => ({ id, type: "model" })),
		});
	}

	if (
		request.method !== "POST" ||
		!matchesGatewayEndpoint(url.pathname, "messages")
	) {
		return jsonResponse(404, { error: { message: "Not found" } });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonResponse(400, { error: { message: "Invalid JSON body" } });
	}
	if (!isObjectRecord(body) || typeof body.model !== "string") {
		return jsonResponse(400, { error: { message: "Missing model" } });
	}

	const resolved = resolveProviderForRequest({
		db,
		auth,
		requestModel: body.model,
	});
	if (!resolved) {
		return jsonResponse(404, {
			error: { message: "No configured provider can serve this model" },
		});
	}
	const requestBody = {
		...(body as unknown as AnthropicMessageBody),
		model: resolved.upstreamModelId,
	};
	if (resolved.provider.protocol === "anthropic") {
		return forwardAnthropic({
			provider: resolved.provider,
			body: requestBody,
			fetchImpl,
		});
	}
	return forwardTranslated({
		protocol: resolved.provider.protocol,
		provider: resolved.provider,
		body: requestBody,
		fetchImpl,
	});
}
