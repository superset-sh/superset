import type { PromptTransport } from "@superset/shared/agent-prompt-launch";
import { z } from "zod";

export const promptTransportSchema = z.enum(["argv", "stdin"]);
export const agentArgvSchema = z.array(z.string());
export const agentEnvSchema = z.record(z.string(), z.string());
const storedArgvSchema = agentArgvSchema.catch([]);
const storedEnvSchema = agentEnvSchema.catch({});
const storedPromptTransportSchema = promptTransportSchema.catch("argv");

export function parseAgentArgv(value: string): string[] {
	try {
		return storedArgvSchema.parse(JSON.parse(value));
	} catch {
		return [];
	}
}

export function parseAgentEnv(value: string): Record<string, string> {
	try {
		return storedEnvSchema.parse(JSON.parse(value));
	} catch {
		return {};
	}
}

export function parsePromptTransport(value: string): PromptTransport {
	return storedPromptTransportSchema.parse(value);
}
