import type {
	MessageRow,
	ModelMessage,
	SessionDB,
} from "@superset/durable-session";
import type { Collection } from "@tanstack/db";
import { z } from "zod";

export type ActorType = "user" | "agent";

export interface StreamRow {
	sessionId: string;
	messageId: string;
	actorId: string;
	actorType: ActorType;
	chunk: string;
	createdAt: string;
	seq: number;
}

export const streamRowSchema = z.object({
	sessionId: z.string(),
	messageId: z.string(),
	actorId: z.string(),
	actorType: z.enum(["user", "agent"]),
	chunk: z.string(),
	createdAt: z.string(),
	seq: z.number(),
});

export interface SendMessageRequest {
	messageId?: string;
	content: string;
	role?: "user" | "assistant" | "system";
	actorId?: string;
	actorType?: ActorType;
	txid?: string;
}

export const sendMessageRequestSchema = z.object({
	messageId: z.string().uuid().optional(),
	content: z.string(),
	role: z.enum(["user", "assistant", "system"]).optional(),
	actorId: z.string().optional(),
	actorType: z.enum(["user", "agent"]).optional(),
	txid: z.string().uuid().optional(),
});

export interface ToolResultRequest {
	toolCallId: string;
	output: unknown;
	error?: string | null;
	messageId?: string;
	txid?: string;
}

export const toolResultRequestSchema = z.object({
	toolCallId: z.string(),
	output: z.unknown(),
	error: z.string().nullable().optional(),
	messageId: z.string().optional(),
	txid: z.string().uuid().optional(),
});

export interface ApprovalResponseRequest {
	approved: boolean;
	txid?: string;
}

export const approvalResponseRequestSchema = z.object({
	approved: z.boolean(),
	txid: z.string().uuid().optional(),
});

export interface ForkSessionRequest {
	atMessageId?: string | null;
	newSessionId?: string | null;
}

export const forkSessionRequestSchema = z.object({
	atMessageId: z.string().nullable().optional(),
	newSessionId: z.string().uuid().nullable().optional(),
});

export interface StopGenerationRequest {
	messageId?: string | null;
}

export const stopGenerationRequestSchema = z.object({
	messageId: z.string().nullable().optional(),
});

export interface SendMessageResponse {
	messageId: string;
}

export interface ForkSessionResponse {
	sessionId: string;
	offset: string;
}

export interface StreamChunk {
	type: string;
	[key: string]: unknown;
}

export interface SessionState {
	createdAt: string;
	lastActivityAt: string;
	activeGenerations: string[];
}

export interface ProxySessionState extends SessionState {
	sessionDB: SessionDB;
	messages: Collection<MessageRow>;
	modelMessages: Collection<ModelMessage>;
	changeSubscription: { unsubscribe: () => void } | null;
	isReady: boolean;
}

export interface AIDBProtocolOptions {
	baseUrl: string;
	storage?: "memory" | "durable-object";
}
