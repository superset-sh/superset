/**
 * Type definitions for the durable session proxy.
 */

import type {
	MessageRow,
	ModelMessage,
	SessionDB,
} from "@superset/durable-session";
import type { Collection } from "@tanstack/db";
import { z } from "zod";

// ============================================================================
// Stream Row Types
// ============================================================================

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

// ============================================================================
// Agent Types
// ============================================================================

export type AgentTrigger = "all" | "user-messages";

export interface AgentSpec {
	id: string;
	name?: string;
	endpoint: string;
	method?: "POST";
	headers?: Record<string, string>;
	triggers?: AgentTrigger;
	bodyTemplate?: Record<string, unknown>;
}

export const agentSpecSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	endpoint: z.string().url(),
	method: z.literal("POST").optional(),
	headers: z.record(z.string(), z.string()).optional(),
	triggers: z.enum(["all", "user-messages"]).optional(),
	bodyTemplate: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// Request Types
// ============================================================================

export interface SendMessageRequest {
	messageId?: string;
	content: string;
	role?: "user" | "assistant" | "system";
	actorId?: string;
	actorType?: ActorType;
	agent?: AgentSpec;
	txid?: string;
}

export const sendMessageRequestSchema = z.object({
	messageId: z.string().uuid().optional(),
	content: z.string(),
	role: z.enum(["user", "assistant", "system"]).optional(),
	actorId: z.string().optional(),
	actorType: z.enum(["user", "agent"]).optional(),
	agent: agentSpecSchema.optional(),
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

export interface RegisterAgentsRequest {
	agents: AgentSpec[];
}

export const registerAgentsRequestSchema = z.object({
	agents: z.array(agentSpecSchema),
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

export interface RegenerateRequest {
	fromMessageId: string;
	content: string;
	actorId?: string;
	actorType?: ActorType;
}

export const regenerateRequestSchema = z.object({
	fromMessageId: z.string(),
	content: z.string(),
	actorId: z.string().optional(),
	actorType: z.enum(["user", "agent"]).optional(),
});

// ============================================================================
// Response Types
// ============================================================================

export interface SendMessageResponse {
	messageId: string;
}

export interface ForkSessionResponse {
	sessionId: string;
	offset: string;
}

// ============================================================================
// Stream Chunk Types (TanStack AI compatible)
// ============================================================================

export interface StreamChunk {
	type: string;
	[key: string]: unknown;
}

// ============================================================================
// Session State Types
// ============================================================================

export interface SessionState {
	createdAt: string;
	lastActivityAt: string;
	agents: AgentSpec[];
	activeGenerations: string[];
}

export interface ProxySessionState extends SessionState {
	sessionDB: SessionDB;
	messages: Collection<MessageRow>;
	modelMessages: Collection<ModelMessage>;
	changeSubscription: { unsubscribe: () => void } | null;
	isReady: boolean;
}

// ============================================================================
// Protocol Options
// ============================================================================

export interface AIDBProtocolOptions {
	baseUrl: string;
	storage?: "memory" | "durable-object";
}
