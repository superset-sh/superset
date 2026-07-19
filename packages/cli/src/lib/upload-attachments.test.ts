import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostServiceClient } from "./host-target";
import { prepareAttachmentIds } from "./upload-attachments";

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("prepareAttachmentIds", () => {
	it("keeps existing IDs first and uploads local paths in order", async () => {
		const directory = mkdtempSync(join(tmpdir(), "cli-agent-attachments-"));
		directories.push(directory);
		const first = join(directory, "context.md");
		const second = join(directory, "trace.log");
		writeFileSync(first, "markdown context");
		writeFileSync(second, "trace context");

		const uploads: Array<Record<string, unknown>> = [];
		const client = {
			attachments: {
				upload: {
					mutate: async (input: Record<string, unknown>) => {
						uploads.push(input);
						return { attachmentId: `uploaded-${uploads.length}` };
					},
				},
			},
		} as unknown as HostServiceClient;

		expect(
			await prepareAttachmentIds(client, {
				attachmentIds: ["existing-1"],
				attachmentPaths: [first, second],
			}),
		).toEqual(["existing-1", "uploaded-1", "uploaded-2"]);
		expect(uploads.map((upload) => upload.originalFilename)).toEqual([
			"context.md",
			"trace.log",
		]);
	});

	it("does no host work when only existing IDs are supplied", async () => {
		const client = {
			attachments: {
				upload: {
					mutate: () => {
						throw new Error("unexpected upload");
					},
				},
			},
		} as unknown as HostServiceClient;

		expect(
			await prepareAttachmentIds(client, { attachmentIds: ["existing-1"] }),
		).toEqual(["existing-1"]);
	});
});
