import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SlackImageAsset } from "../slack-image-assets";

/**
 * MCP tool results carry their payload either as `structuredContent` or as a
 * JSON string in the first text block, depending on the tool.
 */
function parseTextContent(content: unknown): Record<string, unknown> | null {
	if (!Array.isArray(content)) return null;
	const first = content.find(
		(block): block is { type: "text"; text: string } =>
			typeof block === "object" &&
			block !== null &&
			(block as { type?: unknown }).type === "text" &&
			typeof (block as { text?: unknown }).text === "string",
	);
	if (!first) return null;
	try {
		return JSON.parse(first.text) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * Tools that launch a coding agent, and so should carry the Slack message's
 * images into the session they start.
 */
const ATTACHMENT_FORWARDING_TOOLS = new Set([
	"agents_create",
	"workspaces_create",
]);

/**
 * Upload the Slack images to one host, once, reusing the ids for any later
 * launch on that same host. Attachments are host-scoped, so the cache is keyed
 * by host rather than shared across the run.
 */
async function uploadSlackImagesToHost({
	hostId,
	images,
	mcpClient,
	cache,
}: {
	hostId: string;
	images: SlackImageAsset[];
	mcpClient: Client;
	cache: Map<string, string[]>;
}): Promise<string[]> {
	const cached = cache.get(hostId);
	if (cached) {
		return cached;
	}

	const attachmentIds: string[] = [];
	for (const image of images) {
		const result = await mcpClient.callTool({
			name: "attachments_upload",
			arguments: {
				hostId,
				data: image.base64Data,
				mediaType: image.mediaType,
				originalFilename: image.filename,
			},
		});

		const data = (result.structuredContent ??
			parseTextContent(result.content)) as {
			attachmentId?: string;
		} | null;

		if (data?.attachmentId) {
			attachmentIds.push(data.attachmentId);
		}
	}

	cache.set(hostId, attachmentIds);
	return attachmentIds;
}

/**
 * Carry images attached to the Slack message into the agent session the model
 * is about to spawn.
 *
 * Done here rather than as a tool the model calls, for two reasons: the model
 * cannot reproduce the image bytes to pass them itself, and the target host is
 * only known once it has chosen one. Forwarding unconditionally also means an
 * attached screenshot reaches the session whether or not the model thought to
 * mention it.
 *
 * A failed upload degrades to launching without the attachment rather than
 * failing the spawn outright — losing the image is bad, losing the work the
 * user asked for is worse.
 */
export async function forwardSlackImageAttachments({
	toolName,
	args,
	images,
	mcpClient,
	cache,
}: {
	toolName: string;
	args: Record<string, unknown>;
	images: SlackImageAsset[] | undefined;
	mcpClient: Client;
	cache: Map<string, string[]>;
}): Promise<Record<string, unknown>> {
	if (
		!images ||
		images.length === 0 ||
		!ATTACHMENT_FORWARDING_TOOLS.has(toolName)
	) {
		return args;
	}

	const hostId = typeof args.hostId === "string" ? args.hostId : null;
	if (!hostId) {
		return args;
	}

	let attachmentIds: string[];
	try {
		attachmentIds = await uploadSlackImagesToHost({
			hostId,
			images,
			mcpClient,
			cache,
		});
	} catch (error) {
		console.warn(
			"[slack-agent] Failed to forward Slack images to host:",
			hostId,
			error,
		);
		return args;
	}

	if (attachmentIds.length === 0) {
		return args;
	}

	// `agents_create` takes the ids at the top level; `workspaces_create` takes
	// them per entry in its `agents` launch sugar.
	if (toolName === "agents_create") {
		return {
			...args,
			attachmentIds: mergeAttachmentIds(args.attachmentIds, attachmentIds),
		};
	}

	if (!Array.isArray(args.agents) || args.agents.length === 0) {
		return args;
	}

	return {
		...args,
		agents: args.agents.map((entry) => {
			if (typeof entry !== "object" || entry === null) {
				return entry;
			}

			const launch = entry as Record<string, unknown>;
			return {
				...launch,
				attachmentIds: mergeAttachmentIds(launch.attachmentIds, attachmentIds),
			};
		}),
	};
}

function mergeAttachmentIds(existing: unknown, added: string[]): string[] {
	const current = Array.isArray(existing)
		? existing.filter((id): id is string => typeof id === "string")
		: [];

	return [...new Set([...current, ...added])];
}
