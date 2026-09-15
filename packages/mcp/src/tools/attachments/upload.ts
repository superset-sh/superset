import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "attachments_upload",
		annotations: { destructiveHint: false },
		description:
			"Upload a file to a host's attachment storage and get back the `attachmentId` that `agents_create` and `workspaces_create` accept in `attachmentIds`. Attachments are host-scoped, so upload to the same hostId the workspace lives on. Intended for callers that already hold the bytes (an integration forwarding a user's upload); an agent cannot reproduce the bytes of a file it was merely shown.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId to store the attachment on."),
			data: z.string().min(1).describe("File contents, base64-encoded."),
			mediaType: z
				.string()
				.min(1)
				.describe("IANA media type, e.g. `image/png`."),
			originalFilename: z
				.string()
				.optional()
				.describe("Display filename preserved on the host."),
		},
		handler: async (input, ctx) => {
			return hostServiceCall<{
				attachmentId: string;
				originalFilename?: string;
				mediaType: string;
				sizeBytes: number;
			}>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"attachments.upload",
				"mutation",
				{
					data: { kind: "base64", data: input.data },
					mediaType: input.mediaType,
					originalFilename: input.originalFilename,
				},
			);
		},
	});
}
