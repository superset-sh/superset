import { describe, expect, test } from "bun:test";
import type { ResolveCtx } from "../types";
import { attachmentContributor } from "./attachment";

const resolveCtx = {} as ResolveCtx;

describe("attachmentContributor", () => {
	test("metadata is set", () => {
		expect(attachmentContributor.kind).toBe("attachment");
		expect(attachmentContributor.requiresQuery).toBe(false);
	});

	test("resolves a text/plain attachment to a file ContentPart", async () => {
		const section = await attachmentContributor.resolve(
			{
				kind: "attachment",
				file: {
					data: new Uint8Array([1, 2, 3]),
					mediaType: "text/plain",
					filename: "notes.txt",
				},
			},
			resolveCtx,
		);
		expect(section?.kind).toBe("attachment");
		expect(section?.label).toBe("notes.txt");
		expect(section?.content).toEqual([
			{
				type: "file",
				data: new Uint8Array([1, 2, 3]),
				mediaType: "text/plain",
				filename: "notes.txt",
			},
		]);
	});

	test("resolves an image to an image ContentPart", async () => {
		const section = await attachmentContributor.resolve(
			{
				kind: "attachment",
				file: {
					data: new Uint8Array([137, 80, 78, 71]),
					mediaType: "image/png",
					filename: "screen.png",
				},
			},
			resolveCtx,
		);
		expect(section?.content).toEqual([
			{
				type: "image",
				data: new Uint8Array([137, 80, 78, 71]),
				mediaType: "image/png",
			},
		]);
	});

	test("unnamed attachment gets a fallback label and stable id", async () => {
		const section = await attachmentContributor.resolve(
			{
				kind: "attachment",
				file: {
					data: new Uint8Array([9]),
					mediaType: "application/octet-stream",
				},
			},
			resolveCtx,
		);
		expect(section?.id).toBe("attachment:unnamed");
		expect(section?.label).toBe("attachment");
	});

	test("id uses filename when present", async () => {
		const section = await attachmentContributor.resolve(
			{
				kind: "attachment",
				file: {
					data: new Uint8Array([1]),
					mediaType: "text/plain",
					filename: "logs.txt",
				},
			},
			resolveCtx,
		);
		expect(section?.id).toBe("attachment:logs.txt");
	});
});
