import { z } from "zod";

// === Request Schemas ===

export const ScreenshotRequestSchema = z.object({
	rect: z
		.object({
			x: z.number(),
			y: z.number(),
			width: z.number(),
			height: z.number(),
		})
		.optional(),
});

export const DomRequestSchema = z.object({
	selector: z.string().optional(),
	interactiveOnly: z.boolean().optional(),
});

export const ClickRequestSchema = z.object({
	selector: z.string().optional(),
	text: z.string().optional(),
	testId: z.string().optional(),
	x: z.number().optional(),
	y: z.number().optional(),
	index: z.number().int().min(0).default(0),
	fuzzy: z.boolean().default(true),
});

export const TypeRequestSchema = z.object({
	text: z.string(),
	selector: z.string().optional(),
	clearFirst: z.boolean().default(false),
});

export const EvaluateRequestSchema = z.object({
	code: z.string(),
});

export const ConsoleLogsRequestSchema = z.object({
	level: z.enum(["log", "warn", "error", "info", "debug"]).optional(),
	limit: z.number().int().min(1).optional(),
	clear: z.boolean().optional(),
});

export const NavigateRequestSchema = z.object({
	url: z.string().optional(),
	path: z.string().optional(),
});

export const SendKeysRequestSchema = z.object({
	keys: z
		.array(z.string())
		.describe("Keys to send, e.g. ['Meta', 't'] for Cmd+T"),
});

// === Response Schemas ===

export const ScreenshotResponseSchema = z.object({
	image: z.string(),
	width: z.number(),
	height: z.number(),
});

export const DomElementSchema = z.object({
	tag: z.string(),
	id: z.string().optional(),
	classes: z.array(z.string()),
	text: z.string(),
	selector: z.string(),
	bounds: z.object({
		x: z.number(),
		y: z.number(),
		width: z.number(),
		height: z.number(),
	}),
	role: z.string().optional(),
	testId: z.string().optional(),
	interactive: z.boolean(),
	disabled: z.boolean(),
	checked: z.boolean().optional(),
	focused: z.boolean(),
	visible: z.boolean(),
});

export const DomResponseSchema = z.object({
	elements: z.array(DomElementSchema),
});

export const ClickResponseSchema = z.object({
	success: z.boolean(),
	element: z
		.object({
			tag: z.string(),
			text: z.string(),
			selector: z.string(),
		})
		.optional(),
});

export const TypeResponseSchema = z.object({
	success: z.boolean(),
});

export const EvaluateResponseSchema = z.object({
	result: z.unknown(),
});

export const ConsoleLogEntrySchema = z.object({
	level: z.number(),
	message: z.string(),
	source: z.string(),
	line: z.number(),
	timestamp: z.number(),
});

export const ConsoleLogsResponseSchema = z.object({
	logs: z.array(ConsoleLogEntrySchema),
});

export const WindowInfoResponseSchema = z.object({
	bounds: z.object({
		x: z.number(),
		y: z.number(),
		width: z.number(),
		height: z.number(),
	}),
	title: z.string(),
	url: z.string(),
	focused: z.boolean(),
	maximized: z.boolean(),
	fullscreen: z.boolean(),
	visible: z.boolean(),
});

export const NavigateResponseSchema = z.object({
	success: z.boolean(),
	url: z.string(),
});

export const SendKeysResponseSchema = z.object({
	success: z.boolean(),
});

// === Inferred Types ===

export type ScreenshotRequest = z.infer<typeof ScreenshotRequestSchema>;
export type DomRequest = z.infer<typeof DomRequestSchema>;
export type ClickRequest = z.infer<typeof ClickRequestSchema>;
export type TypeRequest = z.infer<typeof TypeRequestSchema>;
export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;
export type ConsoleLogsRequest = z.infer<typeof ConsoleLogsRequestSchema>;
export type NavigateRequest = z.infer<typeof NavigateRequestSchema>;
export type SendKeysRequest = z.infer<typeof SendKeysRequestSchema>;

export type ScreenshotResponse = z.infer<typeof ScreenshotResponseSchema>;
export type DomElement = z.infer<typeof DomElementSchema>;
export type DomResponse = z.infer<typeof DomResponseSchema>;
export type ClickResponse = z.infer<typeof ClickResponseSchema>;
export type TypeResponse = z.infer<typeof TypeResponseSchema>;
export type EvaluateResponse = z.infer<typeof EvaluateResponseSchema>;
export type ConsoleLogEntry = z.infer<typeof ConsoleLogEntrySchema>;
export type ConsoleLogsResponse = z.infer<typeof ConsoleLogsResponseSchema>;
export type WindowInfoResponse = z.infer<typeof WindowInfoResponseSchema>;
export type NavigateResponse = z.infer<typeof NavigateResponseSchema>;
export type SendKeysResponse = z.infer<typeof SendKeysResponseSchema>;
