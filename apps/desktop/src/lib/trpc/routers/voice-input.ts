import { getOpenAICredentialsFromAnySource } from "@superset/chat/server/desktop";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "..";

const OPENAI_TRANSCRIPTION_URL =
	"https://api.openai.com/v1/audio/transcriptions";
const OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MIN_AUDIO_BYTES = 512;

function resolveOpenAIApiKey(): string | null {
	const envApiKey = process.env.OPENAI_API_KEY?.trim();
	if (envApiKey) return envApiKey;

	const envAuthToken = process.env.OPENAI_AUTH_TOKEN?.trim();
	if (envAuthToken) return envAuthToken;

	const credential = getOpenAICredentialsFromAnySource();
	if (!credential) return null;
	if (
		credential.kind === "oauth" &&
		typeof credential.expiresAt === "number" &&
		Date.now() >= credential.expiresAt
	) {
		return null;
	}

	return credential.apiKey;
}

function extensionForMimeType(mimeType: string): string {
	const normalizedMimeType = mimeType.toLowerCase();
	if (normalizedMimeType.includes("webm")) return "webm";
	if (normalizedMimeType.includes("mp4")) return "mp4";
	if (normalizedMimeType.includes("mpeg")) return "mpeg";
	if (normalizedMimeType.includes("mp3")) return "mp3";
	if (normalizedMimeType.includes("m4a")) return "m4a";
	if (normalizedMimeType.includes("wav")) return "wav";
	return "webm";
}

async function readOpenAIError(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as {
			error?: { message?: unknown; code?: unknown; type?: unknown };
		};
		const message = body.error?.message;
		if (typeof message === "string" && message.trim()) {
			return message.trim();
		}
	} catch {
		// Fall through to status mapping.
	}

	if (response.status === 401 || response.status === 403) {
		return "OpenAI authentication failed. Update OpenAI in Settings > Models.";
	}
	if (response.status === 429) {
		return "OpenAI transcription is rate limited. Try again shortly.";
	}

	return `OpenAI transcription failed (${response.status}).`;
}

export const createVoiceInputRouter = () => {
	return router({
		transcribe: publicProcedure
			.input(
				z.object({
					audioBase64: z.string().min(1),
					mimeType: z.string().min(1).max(120),
				}),
			)
			.mutation(async ({ input }) => {
				const apiKey = resolveOpenAIApiKey();
				if (!apiKey) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message:
							"Connect OpenAI in Settings > Models to use Voice Control dictation.",
					});
				}

				const audioBuffer = Buffer.from(input.audioBase64, "base64");
				if (audioBuffer.length < MIN_AUDIO_BYTES) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "No audio was captured.",
					});
				}
				if (audioBuffer.length > MAX_AUDIO_BYTES) {
					throw new TRPCError({
						code: "PAYLOAD_TOO_LARGE",
						message: "Voice dictation is limited to 25 MB recordings.",
					});
				}

				const formData = new FormData();
				const audioBlob = new Blob([audioBuffer], { type: input.mimeType });
				formData.append(
					"file",
					audioBlob,
					`dictation.${extensionForMimeType(input.mimeType)}`,
				);
				formData.append("model", OPENAI_TRANSCRIPTION_MODEL);
				formData.append("response_format", "json");
				formData.append(
					"prompt",
					"Transcribe developer dictation for a terminal or chat composer. Preserve command names, file paths, punctuation, and technical terms.",
				);

				const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
					},
					body: formData,
				});

				if (!response.ok) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: await readOpenAIError(response),
					});
				}

				const data = (await response.json()) as { text?: unknown };
				const text = typeof data.text === "string" ? data.text.trim() : "";
				if (!text) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "OpenAI returned an empty transcription.",
					});
				}

				return { text };
			}),
	});
};
