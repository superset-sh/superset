import { describe, expect, test } from "bun:test";
import type { ZodType } from "zod";
import {
	chatAttachmentFileDataSchema,
	imageUploadFileDataSchema,
	MAX_CHAT_ATTACHMENT_BYTES,
	MAX_IMAGE_UPLOAD_BYTES,
	maxBase64Length,
} from "./upload-limits";

// The routers pull in the db client, auth and Stripe at import time. None of
// them are exercised here — we only read the input schemas off the procedures —
// so skipping env validation and supplying obviously-fake values is enough to
// get the modules loaded.
Object.assign(process.env, {
	SKIP_ENV_VALIDATION: "1",
	DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://u:p@localhost/db",
	DATABASE_URL_UNPOOLED:
		process.env.DATABASE_URL_UNPOOLED ?? "postgresql://u:p@localhost/db",
	STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "sk_test_fake",
	RESEND_API_KEY: process.env.RESEND_API_KEY ?? "re_test",
	NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost",
	NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_test",
	NEXT_PUBLIC_MARKETING_URL:
		process.env.NEXT_PUBLIC_MARKETING_URL ?? "http://localhost",
});

type ProcedureRecord = Record<string, { _def: { inputs: ZodType[] } }>;

function getInputSchema(router: unknown, procedureName: string): ZodType {
	const [schema] =
		(router as ProcedureRecord)[procedureName]?._def.inputs ?? [];
	if (!schema) throw new Error(`${procedureName} has no input schema`);
	return schema;
}

const UPLOAD_PROCEDURES = [
	{
		name: "organization.uploadLogo",
		maxBytes: MAX_IMAGE_UPLOAD_BYTES,
		load: async () => {
			const { organizationRouter } = await import(
				"../router/organization/organization"
			);
			return getInputSchema(organizationRouter, "uploadLogo");
		},
		validInput: (fileData: string) => ({
			organizationId: "00000000-0000-4000-8000-000000000000",
			fileData,
			fileName: "logo.png",
			mimeType: "image/png",
		}),
	},
	{
		name: "user.uploadAvatar",
		maxBytes: MAX_IMAGE_UPLOAD_BYTES,
		load: async () => {
			const { userRouter } = await import("../router/user/user");
			return getInputSchema(userRouter, "uploadAvatar");
		},
		validInput: (fileData: string) => ({
			fileData,
			fileName: "avatar.png",
			mimeType: "image/png",
		}),
	},
	{
		name: "v2Project.uploadIcon",
		maxBytes: MAX_IMAGE_UPLOAD_BYTES,
		load: async () => {
			const { v2ProjectRouter } = await import(
				"../router/v2-project/v2-project"
			);
			return getInputSchema(v2ProjectRouter, "uploadIcon");
		},
		validInput: (fileData: string) => ({
			id: "00000000-0000-4000-8000-000000000000",
			fileData,
			fileName: "icon.png",
			mimeType: "image/png",
		}),
	},
	{
		name: "chat.uploadAttachment",
		maxBytes: MAX_CHAT_ATTACHMENT_BYTES,
		load: async () => {
			const { chatRouter } = await import("../router/chat/chat");
			return getInputSchema(chatRouter, "uploadAttachment");
		},
		validInput: (fileData: string) => ({
			sessionId: "00000000-0000-4000-8000-000000000000",
			filename: "notes.txt",
			mediaType: "text/plain",
			fileData,
		}),
	},
] as const;

describe("maxBase64Length", () => {
	test("allows a file of exactly maxBytes to encode", () => {
		const bytes = 3 * 1024 * 1024;
		const encodedLength = Buffer.alloc(bytes).toString("base64").length;

		expect(maxBase64Length(bytes)).toBeGreaterThanOrEqual(encodedLength);
	});

	test("stays proportional to the byte budget", () => {
		expect(maxBase64Length(MAX_IMAGE_UPLOAD_BYTES)).toBeGreaterThan(
			maxBase64Length(MAX_CHAT_ATTACHMENT_BYTES),
		);
	});
});

describe("file data schemas", () => {
	test("image uploads reject payloads past the limit", () => {
		const parsed = imageUploadFileDataSchema.safeParse(
			"A".repeat(maxBase64Length(MAX_IMAGE_UPLOAD_BYTES) + 1),
		);

		expect(parsed.success).toBe(false);
		expect(JSON.stringify(parsed.error?.issues)).toContain("File too large");
	});

	test("image uploads accept a 4.5MB image", () => {
		const fileData = Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES).toString("base64");

		expect(imageUploadFileDataSchema.safeParse(fileData).success).toBe(true);
	});

	test("image uploads accept a data URL of a 4.5MB image", () => {
		const fileData = `data:image/png;base64,${Buffer.alloc(
			MAX_IMAGE_UPLOAD_BYTES,
		).toString("base64")}`;

		expect(imageUploadFileDataSchema.safeParse(fileData).success).toBe(true);
	});

	test("chat attachments reject payloads past the limit", () => {
		const parsed = chatAttachmentFileDataSchema.safeParse(
			"A".repeat(maxBase64Length(MAX_CHAT_ATTACHMENT_BYTES) + 1),
		);

		expect(parsed.success).toBe(false);
	});

	test("chat attachments accept a 3.5MB file", () => {
		const fileData = Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES).toString("base64");

		expect(chatAttachmentFileDataSchema.safeParse(fileData).success).toBe(true);
	});

	test("empty payloads are rejected", () => {
		expect(imageUploadFileDataSchema.safeParse("").success).toBe(false);
		expect(chatAttachmentFileDataSchema.safeParse("").success).toBe(false);
	});
});

describe.each(
	UPLOAD_PROCEDURES.map((p) => [p.name, p] as const),
)("%s", (_name, procedure) => {
	test("rejects an unbounded fileData payload", async () => {
		const schema = await procedure.load();
		const oversized = "A".repeat(maxBase64Length(procedure.maxBytes) + 1);

		expect(schema.safeParse(procedure.validInput(oversized)).success).toBe(
			false,
		);
	});

	test("still accepts a payload within the limit", async () => {
		const schema = await procedure.load();
		const fileData = Buffer.alloc(procedure.maxBytes).toString("base64");

		expect(schema.safeParse(procedure.validInput(fileData)).success).toBe(true);
	});
});
