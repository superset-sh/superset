import { describe, expect, test } from "bun:test";
import {
	MAX_WRITE_FILE_BASE64_LENGTH,
	MAX_WRITE_FILE_BYTES,
} from "@superset/shared/write-file-limits";
import type { AnyTRPCRouter } from "@trpc/server";
import type { ZodType } from "zod";
import { createFilesystemRouter } from ".";

function getWriteFileInputSchema(): ZodType {
	const router = createFilesystemRouter() as unknown as AnyTRPCRouter;
	const procedure = router._def.procedures.writeFile as {
		_def: { inputs: ZodType[] };
	};
	const [schema] = procedure._def.inputs;
	if (!schema) throw new Error("writeFile has no input schema");
	return schema;
}

describe("filesystem.writeFile input", () => {
	test("rejects oversized text content", () => {
		const parsed = getWriteFileInputSchema().safeParse({
			workspaceId: "workspace-1",
			absolutePath: "/tmp/huge.txt",
			content: "a".repeat(MAX_WRITE_FILE_BYTES + 1),
		});

		expect(parsed.success).toBe(false);
	});

	test("rejects oversized base64 content", () => {
		const parsed = getWriteFileInputSchema().safeParse({
			workspaceId: "workspace-1",
			absolutePath: "/tmp/huge.bin",
			content: {
				kind: "base64",
				data: "A".repeat(MAX_WRITE_FILE_BASE64_LENGTH + 1),
			},
		});

		expect(parsed.success).toBe(false);
	});

	test("still accepts ordinary content", () => {
		const parsed = getWriteFileInputSchema().safeParse({
			workspaceId: "workspace-1",
			absolutePath: "/tmp/notes.txt",
			content: "hello world",
		});

		expect(parsed.success).toBe(true);
	});
});
