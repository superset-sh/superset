import type { WebClient } from "@slack/web-api";

const SUPPORTED_IMAGE_MEDIA_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
] as const);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Leave room for base64 expansion, prompts and tool definitions in the API request.
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGES = 20;

type SupportedImageMediaType =
	| "image/jpeg"
	| "image/png"
	| "image/gif"
	| "image/webp";

type SlackImageAssetErrorCode =
	| "reauth_required"
	| "invalid_file_metadata"
	| "unsupported_image_type"
	| "download_failed"
	| "safety_limit_exceeded";

interface SlackMessageFileInput {
	id?: string;
	name?: string;
	mimetype?: string;
	size?: number;
	url_private?: string;
	url_private_download?: string;
}

interface ExtractSlackImageAssetsParams {
	eventFiles: unknown;
	slack: WebClient;
	slackToken: string;
	/** Epoch ms; downloads never run past it, so preflight shares the run budget. */
	deadline?: number;
}

export interface SlackImageAsset {
	filename?: string;
	mediaType: SupportedImageMediaType;
	base64Data: string;
}

export class SlackImageAssetError extends Error {
	public readonly code: SlackImageAssetErrorCode;

	constructor(code: SlackImageAssetErrorCode, message: string) {
		super(message);
		this.name = "SlackImageAssetError";
		this.code = code;
	}
}

export function formatSlackImageAssetError(error: unknown): string {
	if (!(error instanceof SlackImageAssetError)) {
		return "I couldn't process the image attachment. Please try again.";
	}

	if (error.code === "reauth_required") {
		return "I couldn't access one or more Slack images because this workspace needs updated Slack permissions (`files:read`). Please reconnect the Superset Slack integration and try again.";
	}

	return error.message;
}

const DOWNLOAD_TIMEOUT_MS = 30_000;

export async function extractSlackImageAssets({
	eventFiles,
	slack,
	slackToken,
	deadline,
}: ExtractSlackImageAssetsParams): Promise<SlackImageAsset[]> {
	const files = parseEventFiles(eventFiles);
	if (files.length === 0) {
		return [];
	}

	const assets: SlackImageAsset[] = [];
	let totalBytes = 0;

	for (const eventFile of files) {
		const fileId = eventFile.id;
		if (!fileId) {
			throw new SlackImageAssetError(
				"invalid_file_metadata",
				"I couldn't process one of the attached images because its Slack file ID was missing.",
			);
		}

		const metadata = await fetchSlackFileMetadata({
			fileId,
			slack,
			fallback: eventFile,
		});

		const fileName = metadata.name ?? metadata.id ?? "image";
		const mediaType = normalizeImageMediaType(metadata.mimetype);
		if (!mediaType || !metadata.mimetype?.startsWith("image/")) {
			// Non-image attachments are ignored; only image assets are ingested.
			continue;
		}

		const sizeError = () =>
			new SlackImageAssetError(
				"safety_limit_exceeded",
				"I couldn't process these images because the total attachment size is too large. Please retry with smaller images.",
			);
		const byteLimit = Math.min(
			MAX_IMAGE_BYTES,
			MAX_TOTAL_IMAGE_BYTES - totalBytes,
		);
		if (assets.length >= MAX_IMAGES || (metadata.size ?? 0) > byteLimit) {
			throw sizeError();
		}

		const downloadUrl = metadata.url_private_download ?? metadata.url_private;
		if (!downloadUrl) {
			throw new SlackImageAssetError(
				"invalid_file_metadata",
				`I couldn't download *${fileName}* because Slack did not return a private download URL.`,
			);
		}

		const remaining =
			deadline === undefined ? DOWNLOAD_TIMEOUT_MS : deadline - Date.now();
		if (remaining <= 0) {
			throw new SlackImageAssetError(
				"download_failed",
				"I ran out of time downloading the attached images. Please retry with fewer or smaller images.",
			);
		}
		const response = await fetch(downloadUrl, {
			signal: AbortSignal.timeout(Math.min(DOWNLOAD_TIMEOUT_MS, remaining)),
			headers: {
				Authorization: `Bearer ${slackToken}`,
			},
		});

		if (response.status === 401 || response.status === 403) {
			throw new SlackImageAssetError(
				"reauth_required",
				"Slack denied access while downloading image attachments. Please reconnect the Slack integration and try again.",
			);
		}

		if (!response.ok) {
			throw new SlackImageAssetError(
				"download_failed",
				`I couldn't download *${fileName}* from Slack (HTTP ${response.status}). Please try again.`,
			);
		}

		const responseMediaType = normalizeImageMediaType(
			extractContentType(response.headers.get("content-type")),
		);
		const resolvedMediaType = responseMediaType ?? mediaType;
		if (!resolvedMediaType) {
			throw new SlackImageAssetError(
				"unsupported_image_type",
				`I can't process *${fileName}* because its downloaded type is unsupported.`,
			);
		}

		if (Number(response.headers.get("content-length")) > byteLimit) {
			await response.body?.cancel();
			throw sizeError();
		}
		// Enforce the limit while streaming, including when metadata/headers lie.
		const reader = response.body?.getReader();
		if (!reader)
			throw new SlackImageAssetError(
				"download_failed",
				"I couldn't process the image attachment. Please try again.",
			);
		const chunks: Uint8Array[] = [];
		let imageBytes = 0;
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				imageBytes += value.byteLength;
				if (imageBytes > byteLimit) {
					await reader.cancel();
					throw sizeError();
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
		const bytes = Buffer.concat(chunks);
		totalBytes += imageBytes;

		assets.push({
			filename: metadata.name,
			mediaType: resolvedMediaType,
			base64Data: Buffer.from(bytes).toString("base64"),
		});
	}

	return assets;
}

async function fetchSlackFileMetadata({
	fileId,
	slack,
	fallback,
}: {
	fileId: string;
	slack: WebClient;
	fallback: SlackMessageFileInput;
}): Promise<SlackMessageFileInput> {
	try {
		const result = await slack.files.info({ file: fileId });
		const file = toRecord(result.file);
		if (!file) {
			throw new SlackImageAssetError(
				"invalid_file_metadata",
				`I couldn't load metadata for Slack file ${fileId}.`,
			);
		}

		return {
			id: getString(file, "id") ?? fallback.id,
			name: getString(file, "name") ?? fallback.name,
			mimetype: getString(file, "mimetype") ?? fallback.mimetype,
			size: getNumber(file, "size") ?? fallback.size,
			url_private:
				getString(file, "url_private") ??
				getString(file, "url_private_download") ??
				fallback.url_private,
			url_private_download:
				getString(file, "url_private_download") ??
				fallback.url_private_download,
		};
	} catch (error) {
		const slackErrorCode = extractSlackApiErrorCode(error);
		if (isReauthSlackErrorCode(slackErrorCode)) {
			throw new SlackImageAssetError(
				"reauth_required",
				"Slack file access is missing required permissions. Please reconnect the Slack integration.",
			);
		}

		throw new SlackImageAssetError(
			"download_failed",
			`I couldn't read Slack metadata for file ${fileId}.`,
		);
	}
}

function parseEventFiles(eventFiles: unknown): SlackMessageFileInput[] {
	if (!Array.isArray(eventFiles)) {
		return [];
	}

	return eventFiles
		.map((entry): SlackMessageFileInput | null => {
			const file = toRecord(entry);
			if (!file) return null;

			return {
				id: getString(file, "id") ?? undefined,
				name: getString(file, "name") ?? undefined,
				mimetype: getString(file, "mimetype") ?? undefined,
				size: getNumber(file, "size") ?? undefined,
				url_private: getString(file, "url_private") ?? undefined,
				url_private_download:
					getString(file, "url_private_download") ?? undefined,
			};
		})
		.filter((file): file is SlackMessageFileInput => file !== null);
}

function normalizeImageMediaType(
	mediaType: string | undefined,
): SupportedImageMediaType | null {
	if (!mediaType) {
		return null;
	}

	const normalized = mediaType.trim().toLowerCase();
	if (normalized === "image/jpg") {
		return "image/jpeg";
	}

	if (SUPPORTED_IMAGE_MEDIA_TYPES.has(normalized as SupportedImageMediaType)) {
		return normalized as SupportedImageMediaType;
	}

	return null;
}

function extractContentType(contentType: string | null): string | undefined {
	if (!contentType) {
		return undefined;
	}

	const [mediaType] = contentType.split(";");
	return mediaType?.trim().toLowerCase();
}

function toRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

function getString(
	record: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function getNumber(
	record: Record<string, unknown>,
	key: string,
): number | undefined {
	const value = record[key];
	return typeof value === "number" ? value : undefined;
}

function extractSlackApiErrorCode(error: unknown): string | null {
	const errorRecord = toRecord(error);
	if (!errorRecord) {
		return null;
	}

	const dataRecord = toRecord(errorRecord.data);
	if (!dataRecord) {
		return null;
	}

	const code = dataRecord.error;
	return typeof code === "string" ? code : null;
}

function isReauthSlackErrorCode(code: string | null): boolean {
	if (!code) {
		return false;
	}

	return (
		code === "missing_scope" ||
		code === "not_authed" ||
		code === "invalid_auth" ||
		code === "token_revoked" ||
		code === "account_inactive"
	);
}
