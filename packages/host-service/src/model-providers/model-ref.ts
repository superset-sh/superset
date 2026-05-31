import type { ProviderModelRef } from "./types";

const MODEL_REF_PREFIX = "superset:";
const MODEL_REF_FULL_PREFIX = "anthropic/superset:";

function encodeBase64Url(value: string): string {
	return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
	return Buffer.from(value, "base64url").toString("utf8");
}

export function encodeProviderModelRef(ref: ProviderModelRef): string {
	return `${MODEL_REF_FULL_PREFIX}${encodeBase64Url(JSON.stringify(ref))}`;
}

export function encodeGatewayModelId(ref: ProviderModelRef): string {
	return `${MODEL_REF_PREFIX}${encodeBase64Url(JSON.stringify(ref))}`;
}

export function decodeProviderModelRef(value: string): ProviderModelRef | null {
	const trimmed = value.trim();
	const encoded = trimmed.startsWith(MODEL_REF_FULL_PREFIX)
		? trimmed.slice(MODEL_REF_FULL_PREFIX.length)
		: trimmed.startsWith(MODEL_REF_PREFIX)
			? trimmed.slice(MODEL_REF_PREFIX.length)
			: null;
	if (!encoded) return null;

	try {
		const parsed = JSON.parse(decodeBase64Url(encoded)) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed) &&
			typeof (parsed as { providerId?: unknown }).providerId === "string" &&
			typeof (parsed as { modelId?: unknown }).modelId === "string"
		) {
			return parsed as ProviderModelRef;
		}
	} catch {
		return null;
	}
	return null;
}

export function modelIdForGateway(value: string): string {
	const decoded = decodeProviderModelRef(value);
	return decoded?.modelId ?? value;
}
