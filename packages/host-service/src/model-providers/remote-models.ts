import type { ModelProviderProtocol } from "../db/schema";
import { appendProviderPath } from "./provider-url";

type FetchLike = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export interface RemoteModelSummary {
	modelId: string;
	displayName: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function modelListFromBody(body: unknown): unknown[] {
	if (Array.isArray(body)) return body;
	if (!isRecord(body)) return [];
	if (Array.isArray(body.data)) return body.data;
	if (Array.isArray(body.models)) return body.models;
	return [];
}

export function parseRemoteModelList(body: unknown): RemoteModelSummary[] {
	const seen = new Set<string>();
	const models: RemoteModelSummary[] = [];

	for (const item of modelListFromBody(body)) {
		const modelId = isRecord(item)
			? (stringValue(item.id) ??
				stringValue(item.model) ??
				stringValue(item.name))
			: stringValue(item);
		if (!modelId || seen.has(modelId)) continue;
		seen.add(modelId);
		const displayName = isRecord(item)
			? (stringValue(item.display_name) ??
				stringValue(item.displayName) ??
				stringValue(item.name) ??
				modelId)
			: modelId;
		models.push({ modelId, displayName });
	}

	return models;
}

function headersForProtocol(
	protocol: ModelProviderProtocol,
	secret: string,
): Headers {
	const headers = new Headers({ accept: "application/json" });
	if (protocol === "anthropic") {
		headers.set("x-api-key", secret);
		headers.set("authorization", `Bearer ${secret}`);
		headers.set("anthropic-version", "2023-06-01");
		return headers;
	}
	headers.set("authorization", `Bearer ${secret}`);
	return headers;
}

export async function fetchRemoteModelList(args: {
	protocol: ModelProviderProtocol;
	baseUrl: string;
	secret: string;
	fetchImpl?: FetchLike;
}): Promise<RemoteModelSummary[]> {
	const fetchImpl = args.fetchImpl ?? fetch;
	let response: Response;
	try {
		response = await fetchImpl(appendProviderPath(args.baseUrl, "/v1/models"), {
			method: "GET",
			headers: headersForProtocol(args.protocol, args.secret),
		});
	} catch {
		throw new Error("Model list request failed before receiving a response");
	}
	if (!response.ok) {
		throw new Error(`Model list request failed with HTTP ${response.status}`);
	}

	let body: unknown;
	try {
		body = (await response.json()) as unknown;
	} catch {
		throw new Error("Model list response was not valid JSON");
	}

	const models = parseRemoteModelList(body);
	if (models.length === 0) {
		throw new Error("Model list response did not contain models");
	}
	return models;
}
