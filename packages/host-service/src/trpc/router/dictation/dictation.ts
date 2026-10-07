import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { hostSettings } from "../../../db/schema";
import {
	DictationError,
	type DictationErrorKind,
	type SuperwhisperAdapter,
	superwhisper,
} from "../../../dictation/superwhisper";
import { protectedProcedure, router } from "../../index";

export const MAX_DICTATION_BYTES = 25 * 1024 * 1024;

export function dictationTrpcError(error: unknown): TRPCError {
	if (!(error instanceof DictationError))
		return new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: error });
	const codes = {
		DISABLED: "PRECONDITION_FAILED",
		UNAVAILABLE: "PRECONDITION_FAILED",
		MODE_NOT_READY: "PRECONDITION_FAILED",
		INVALID_AUDIO: "BAD_REQUEST",
		TIMEOUT: "TIMEOUT",
		TRANSCRIPTION_FAILED: "BAD_GATEWAY",
		RESTORE_FAILED: "BAD_GATEWAY",
	} as const satisfies Record<DictationErrorKind, TRPCError["code"]>;
	return new TRPCError({
		code: codes[error.kind],
		message: error.message,
		cause: { kind: error.kind },
	});
}

export function createDictationRouter(
	adapter: Pick<SuperwhisperAdapter, "transcribe">,
) {
	return router({
		transcribe: protectedProcedure
			.input(
				z.object({
					audio: z.string(),
					mediaType: z.enum([
						"audio/mp4",
						"audio/m4a",
						"audio/x-m4a",
						"audio/wav",
					]),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const settings = ctx.db
					.select({ enabled: hostSettings.superwhisperEnabled })
					.from(hostSettings)
					.where(eq(hostSettings.id, 1))
					.get();
				if (!settings?.enabled)
					throw dictationTrpcError(
						new DictationError(
							"DISABLED",
							"Superwhisper dictation is disabled on this Mac",
						),
					);
				const padding = input.audio.endsWith("==")
					? 2
					: input.audio.endsWith("=")
						? 1
						: 0;
				if (
					Math.floor((input.audio.length * 3) / 4) - padding >
					MAX_DICTATION_BYTES
				)
					throw new TRPCError({
						code: "PAYLOAD_TOO_LARGE",
						message: "Dictation audio exceeds 25 MiB",
					});
				if (
					!input.audio ||
					input.audio.length % 4 !== 0 ||
					!/^[A-Za-z0-9+/]+={0,2}$/.test(input.audio)
				)
					throw dictationTrpcError(
						new DictationError(
							"INVALID_AUDIO",
							"Dictation audio must be nonempty base64",
						),
					);
				const audio = Buffer.from(input.audio, "base64");
				if (audio.toString("base64") !== input.audio)
					throw dictationTrpcError(
						new DictationError(
							"INVALID_AUDIO",
							"Dictation audio has invalid base64 encoding",
						),
					);
				try {
					return await adapter.transcribe(audio, input.mediaType);
				} catch (error) {
					throw dictationTrpcError(error);
				}
			}),
	});
}

export const dictationRouter = createDictationRouter(superwhisper);
