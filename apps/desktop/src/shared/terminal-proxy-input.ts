import type {
	TerminalProxyOverride,
	TerminalProxySettings,
} from "@superset/local-db";
import { z } from "zod";
import {
	hasProxyUrlCredentials,
	normalizeNoProxyCsv,
	PROXY_URL_CREDENTIALS_ERROR_MESSAGE,
	validateTerminalProxyConfig,
} from "./terminal-proxy";

export const terminalProxyConfigInputSchema = z
	.object({
		proxyUrl: z.string().trim().min(1),
		noProxy: z.string().optional(),
	})
	.superRefine((value, ctx) => {
		if (hasProxyUrlCredentials(value.proxyUrl)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["proxyUrl"],
				message: PROXY_URL_CREDENTIALS_ERROR_MESSAGE,
			});
		}
	});

export const terminalProxySettingsInputSchema = z.discriminatedUnion("mode", [
	z.object({
		mode: z.literal("auto"),
	}),
	z.object({
		mode: z.literal("disabled"),
	}),
	z.object({
		mode: z.literal("manual"),
		manual: terminalProxyConfigInputSchema,
	}),
]);

export const terminalProxyOverrideInputSchema = z.discriminatedUnion("mode", [
	z.object({
		mode: z.literal("inherit"),
	}),
	z.object({
		mode: z.literal("disabled"),
	}),
	z.object({
		mode: z.literal("enabled"),
		manual: terminalProxyConfigInputSchema,
	}),
]);

export function sanitizeTerminalProxySettingsInput(
	input: z.infer<typeof terminalProxySettingsInputSchema>,
): TerminalProxySettings {
	if (input.mode !== "manual") {
		return { mode: input.mode };
	}

	if (!input.manual) {
		throw new Error("Manual proxy config is required in manual mode");
	}

	const manual = validateTerminalProxyConfig({
		proxyUrl: input.manual.proxyUrl,
		noProxy: normalizeNoProxyCsv(input.manual.noProxy),
	});

	return { mode: "manual", manual };
}

export function sanitizeTerminalProxyOverrideInput(
	input: z.infer<typeof terminalProxyOverrideInputSchema>,
): TerminalProxyOverride {
	if (input.mode !== "enabled") {
		return { mode: input.mode };
	}

	if (!input.manual) {
		throw new Error("Manual proxy config is required when override is enabled");
	}

	const manual = validateTerminalProxyConfig({
		proxyUrl: input.manual.proxyUrl,
		noProxy: normalizeNoProxyCsv(input.manual.noProxy),
	});

	return { mode: "enabled", manual };
}
