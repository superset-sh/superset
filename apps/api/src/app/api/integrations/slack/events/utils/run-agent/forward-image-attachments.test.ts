import { describe, expect, test } from "bun:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SlackImageAsset } from "../slack-image-assets";
import { forwardSlackImageAttachments } from "./forward-image-attachments";

const IMAGE: SlackImageAsset = {
	filename: "screenshot.png",
	mediaType: "image/png",
	base64Data: "aGVsbG8=",
};

function makeClient({
	ids = ["11111111-1111-4111-8111-111111111111"],
	onCall,
	throws = false,
}: {
	ids?: string[];
	onCall?: (args: Record<string, unknown>) => void;
	throws?: boolean;
} = {}) {
	let index = 0;
	const calls: Record<string, unknown>[] = [];

	const client = {
		callTool: async ({
			arguments: args,
		}: {
			name: string;
			arguments: Record<string, unknown>;
		}) => {
			if (throws) throw new Error("host unreachable");
			calls.push(args);
			onCall?.(args);
			const attachmentId = ids[index++ % ids.length];
			return { structuredContent: { attachmentId } };
		},
	} as unknown as Client;

	return { client, calls };
}

describe("forwardSlackImageAttachments", () => {
	test("passes arguments through untouched when the message had no images", async () => {
		const { client, calls } = makeClient();
		const args = { hostId: "host-1", workspaceId: "ws-1", agent: "claude" };

		const result = await forwardSlackImageAttachments({
			toolName: "agents_create",
			args,
			images: undefined,
			mcpClient: client,
			cache: new Map(),
		});

		expect(result).toBe(args);
		expect(calls).toHaveLength(0);
	});

	test("passes through for tools that do not launch an agent", async () => {
		const { client, calls } = makeClient();
		const args = { hostId: "host-1", title: "a task" };

		const result = await forwardSlackImageAttachments({
			toolName: "tasks_create",
			args,
			images: [IMAGE],
			mcpClient: client,
			cache: new Map(),
		});

		expect(result).toBe(args);
		expect(calls).toHaveLength(0);
	});

	test("uploads the image and attaches its id on agents_create", async () => {
		const { client, calls } = makeClient();

		const result = await forwardSlackImageAttachments({
			toolName: "agents_create",
			args: { hostId: "host-1", workspaceId: "ws-1", agent: "claude" },
			images: [IMAGE],
			mcpClient: client,
			cache: new Map(),
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			hostId: "host-1",
			data: IMAGE.base64Data,
			mediaType: "image/png",
			originalFilename: "screenshot.png",
		});
		expect(result.attachmentIds).toEqual([
			"11111111-1111-4111-8111-111111111111",
		]);
	});

	test("attaches into each agent launch entry on workspaces_create", async () => {
		const { client } = makeClient();

		const result = await forwardSlackImageAttachments({
			toolName: "workspaces_create",
			args: {
				hostId: "host-1",
				name: "fix-bug",
				agents: [
					{ agent: "claude", prompt: "fix it" },
					{ agent: "codex", prompt: "review it" },
				],
			},
			images: [IMAGE],
			mcpClient: client,
			cache: new Map(),
		});

		const agents = result.agents as { attachmentIds: string[] }[];
		expect(agents).toHaveLength(2);
		for (const entry of agents) {
			expect(entry.attachmentIds).toEqual([
				"11111111-1111-4111-8111-111111111111",
			]);
		}
	});

	test("preserves attachment ids the caller already supplied", async () => {
		const { client } = makeClient();
		const existing = "22222222-2222-4222-8222-222222222222";

		const result = await forwardSlackImageAttachments({
			toolName: "agents_create",
			args: {
				hostId: "host-1",
				workspaceId: "ws-1",
				agent: "claude",
				attachmentIds: [existing],
			},
			images: [IMAGE],
			mcpClient: client,
			cache: new Map(),
		});

		expect(result.attachmentIds).toEqual([
			existing,
			"11111111-1111-4111-8111-111111111111",
		]);
	});

	test("uploads once per host and reuses the ids for a later launch", async () => {
		const { client, calls } = makeClient();
		const cache = new Map<string, string[]>();
		const args = { hostId: "host-1", workspaceId: "ws-1", agent: "claude" };

		const first = await forwardSlackImageAttachments({
			toolName: "agents_create",
			args,
			images: [IMAGE],
			mcpClient: client,
			cache,
		});
		const second = await forwardSlackImageAttachments({
			toolName: "agents_create",
			args,
			images: [IMAGE],
			mcpClient: client,
			cache,
		});

		expect(calls).toHaveLength(1);
		expect(second.attachmentIds).toEqual(
			first.attachmentIds as unknown as string[],
		);
	});

	test("uploads separately for a second host, since attachments are host-scoped", async () => {
		const { client, calls } = makeClient({
			ids: [
				"11111111-1111-4111-8111-111111111111",
				"33333333-3333-4333-8333-333333333333",
			],
		});
		const cache = new Map<string, string[]>();

		await forwardSlackImageAttachments({
			toolName: "agents_create",
			args: { hostId: "host-1", workspaceId: "ws-1", agent: "claude" },
			images: [IMAGE],
			mcpClient: client,
			cache,
		});
		const second = await forwardSlackImageAttachments({
			toolName: "agents_create",
			args: { hostId: "host-2", workspaceId: "ws-2", agent: "claude" },
			images: [IMAGE],
			mcpClient: client,
			cache,
		});

		expect(calls).toHaveLength(2);
		expect(second.attachmentIds).toEqual([
			"33333333-3333-4333-8333-333333333333",
		]);
	});

	test("still launches the agent when the upload fails", async () => {
		const { client } = makeClient({ throws: true });
		const args = { hostId: "host-1", workspaceId: "ws-1", agent: "claude" };

		const result = await forwardSlackImageAttachments({
			toolName: "agents_create",
			args,
			images: [IMAGE],
			mcpClient: client,
			cache: new Map(),
		});

		expect(result).toBe(args);
		expect(result.attachmentIds).toBeUndefined();
	});

	test("leaves arguments alone when the model named no host", async () => {
		const { client, calls } = makeClient();
		const args = { workspaceId: "ws-1", agent: "claude" };

		const result = await forwardSlackImageAttachments({
			toolName: "agents_create",
			args,
			images: [IMAGE],
			mcpClient: client,
			cache: new Map(),
		});

		expect(result).toBe(args);
		expect(calls).toHaveLength(0);
	});
});
