import type { QueryClient } from "@tanstack/react-query";
import type { DictationAudio, DictationTarget } from "../dictationSession";

export async function transcribeHostDictation(
	audio: DictationAudio,
	target: DictationTarget,
	dependencies: {
		queryClient: QueryClient;
		readAudio: (uri: string) => Promise<string>;
		transcribe: (hostUrl: string, audio: string) => Promise<{ text: string }>;
	},
): Promise<string> {
	let encoded: string;
	try {
		encoded = await dependencies.readAudio(audio.uri);
	} catch {
		throw { data: { dictation: { kind: "INVALID_AUDIO" } } };
	}
	try {
		const result = await dependencies.transcribe(target.hostUrl, encoded);
		return result.text;
	} catch (error) {
		const kind = (error as { data?: { dictation?: { kind?: string } } })?.data
			?.dictation?.kind;
		if (kind === "DISABLED" || kind === "UNAVAILABLE") {
			void dependencies.queryClient.invalidateQueries({
				queryKey: [
					"host-service",
					"superwhisper",
					target.machineId,
					target.hostUrl,
				],
				exact: true,
			});
		}
		throw error;
	}
}
