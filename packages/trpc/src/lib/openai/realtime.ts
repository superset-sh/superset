import type { RealtimeFunctionTool } from "@superset/shared/voice";

const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

export interface MintRealtimeSecretInput {
	apiKey: string;
	model: string;
	voice: string;
	instructions: string;
	tools: RealtimeFunctionTool[];
	transcriptionModel: string;
	reasoningEffort: string;
	speed: number;
	ttlSeconds: number;
	contextTokenLimit: number;
	/** Opaque per-user id OpenAI uses for abuse monitoring; never an email. */
	safetyIdentifier: string;
}

export interface RealtimeClientSecret {
	value: string;
	/** Unix seconds. */
	expiresAt: number;
}

export class RealtimeMintError extends Error {
	constructor(
		public readonly status: number,
		body: string,
	) {
		super(`OpenAI client_secrets ${status}: ${body.slice(0, 300)}`);
		this.name = "RealtimeMintError";
	}
}

export async function mintRealtimeClientSecret(
	input: MintRealtimeSecretInput,
	fetchImpl: typeof fetch = fetch,
): Promise<RealtimeClientSecret> {
	const response = await fetchImpl(CLIENT_SECRETS_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${input.apiKey}`,
			"Content-Type": "application/json",
			"OpenAI-Safety-Identifier": input.safetyIdentifier,
		},
		body: JSON.stringify({
			expires_after: { anchor: "created_at", seconds: input.ttlSeconds },
			session: {
				type: "realtime",
				model: input.model,
				instructions: input.instructions,
				output_modalities: ["audio"],
				tools: input.tools,
				tool_choice: "auto",
				// Below 1 so each truncation frees room for several turns; one
				// that fires every turn defeats the prompt cache.
				truncation: {
					type: "retention_ratio",
					retention_ratio: 0.8,
					token_limits: { post_instructions: input.contextTokenLimit },
				},
				reasoning: { effort: input.reasoningEffort },
				audio: {
					input: {
						transcription: { model: input.transcriptionModel },
						turn_detection: {
							type: "semantic_vad",
							eagerness: "auto",
							create_response: true,
							interrupt_response: true,
						},
						noise_reduction: { type: "near_field" },
					},
					output: { voice: input.voice, speed: input.speed },
				},
			},
		}),
	});
	if (!response.ok) {
		throw new RealtimeMintError(response.status, await response.text());
	}
	const body = (await response.json()) as {
		value?: unknown;
		expires_at?: unknown;
	};
	if (typeof body.value !== "string" || typeof body.expires_at !== "number") {
		throw new RealtimeMintError(response.status, "missing value/expires_at");
	}
	return { value: body.value, expiresAt: body.expires_at };
}
