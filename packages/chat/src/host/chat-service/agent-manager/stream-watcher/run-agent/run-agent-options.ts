import type { UIMessage } from "ai";

const THINKING_BUDGET_TOKENS = 10_000;
export const DEFAULT_AGENT_MAX_STEPS = 100;

export type RequestEntries = [string, string][];

export function buildRequestEntries(options: {
	modelId: string;
	cwd: string;
	apiUrl: string;
	authHeaders?: Record<string, string>;
	thinkingEnabled?: boolean;
}): RequestEntries {
	const requestEntries: RequestEntries = [
		["modelId", options.modelId],
		["cwd", options.cwd],
		["apiUrl", options.apiUrl],
	];

	if (options.authHeaders && Object.keys(options.authHeaders).length > 0) {
		requestEntries.push(["authHeaders", JSON.stringify(options.authHeaders)]);
	}

	if (options.thinkingEnabled) {
		requestEntries.push(["thinkingEnabled", "true"]);
	}

	return requestEntries;
}

type InputImagePart = {
	type: "image";
	image: URL;
	mimeType: `image/${string}`;
};

type InputFilePart = {
	type: "file";
	data: URL;
	mimeType: string;
};

type StreamInputWithFiles = {
	role: "user";
	content: Array<
		{ type: "text"; text: string } | InputImagePart | InputFilePart
	>;
};

export function buildStreamInput(
	text: string,
	message?: UIMessage,
): string | StreamInputWithFiles {
	const fileParts =
		message?.parts?.filter((part) => part.type === "file") ?? [];
	if (fileParts.length === 0) {
		return text;
	}

	return {
		role: "user",
		content: [
			...(text ? [{ type: "text" as const, text }] : []),
			...fileParts.map((part) => {
				if (part.mediaType.startsWith("image/")) {
					return {
						type: "image" as const,
						image: new URL(part.url),
						mimeType: part.mediaType as `image/${string}`,
					};
				}
				return {
					type: "file" as const,
					data: new URL(part.url),
					mimeType: part.mediaType,
				};
			}),
		],
	};
}

export function isToolApprovalRequired(permissionMode?: string): boolean {
	return permissionMode === "default" || permissionMode === "acceptEdits";
}

export function buildThinkingProviderOptions(thinkingEnabled?: boolean):
	| {
			anthropic: {
				thinking: {
					type: "enabled";
					budgetTokens: number;
				};
			};
	  }
	| undefined {
	if (!thinkingEnabled) {
		return undefined;
	}

	return {
		anthropic: {
			thinking: {
				type: "enabled",
				budgetTokens: THINKING_BUDGET_TOKENS,
			},
		},
	};
}

export interface BuildAgentCallOptionsInput<TRequestContext> {
	requestContext: TRequestContext;
	sessionId: string;
	abortSignal: AbortSignal;
	permissionMode?: string;
	thinkingEnabled?: boolean;
}

export function buildAgentCallOptions<TRequestContext>(
	options: BuildAgentCallOptionsInput<TRequestContext>,
): {
	requestContext: TRequestContext;
	maxSteps: number;
	memory: { thread: string; resource: string };
	abortSignal: AbortSignal;
	requireToolApproval?: boolean;
	providerOptions?: {
		anthropic: {
			thinking: {
				type: "enabled";
				budgetTokens: number;
			};
		};
	};
} {
	const requireToolApproval = isToolApprovalRequired(options.permissionMode);
	const thinkingProviderOptions = buildThinkingProviderOptions(
		options.thinkingEnabled,
	);

	return {
		requestContext: options.requestContext,
		maxSteps: DEFAULT_AGENT_MAX_STEPS,
		memory: {
			thread: options.sessionId,
			resource: options.sessionId,
		},
		abortSignal: options.abortSignal,
		...(requireToolApproval ? { requireToolApproval: true } : {}),
		...(thinkingProviderOptions
			? {
					providerOptions: thinkingProviderOptions,
				}
			: {}),
	};
}

export function normalizeToolCallId(toolCallId: string): string {
	const normalized = toolCallId.trim().replace(/^-+/, "");
	return normalized || toolCallId;
}

export function buildResumeData(
	state: "output-available" | "output-error",
	output: unknown,
): { answers: Record<string, string> } {
	if (state === "output-error") {
		return { answers: {} };
	}

	if (
		typeof output === "object" &&
		output !== null &&
		"answers" in output &&
		typeof output.answers === "object" &&
		output.answers !== null
	) {
		return { answers: output.answers as Record<string, string> };
	}

	return { answers: {} };
}
