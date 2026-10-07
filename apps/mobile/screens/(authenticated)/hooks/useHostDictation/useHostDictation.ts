import { useLingui } from "@lingui/react/macro";
import type { ComposerHandle } from "@superset/composer";
import {
	type QueryClient,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { File } from "expo-file-system";
import {
	type RefObject,
	useEffect,
	useEffectEvent,
	useRef,
	useSyncExternalStore,
} from "react";
import { Alert } from "react-native";
import { authClient, useSession } from "@/lib/auth/client";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { isTrpcErrorWithData } from "@/lib/host-service/errors";
import { useComposerDraftsStore } from "@/screens/(authenticated)/stores/composerDraftsStore";
import {
	createDictationSession,
	createDictationSessionRegistry,
	type DictationAudio,
	type DictationTarget,
	dictationEngineFor,
	dictationScopeKey,
} from "./dictationSession";
import { transcribeHostDictation } from "./transcribeHostDictation";

const composers = new Map<string, RefObject<ComposerHandle | null>>();
const sessions = createDictationSessionRegistry();
type AuthSession = {
	data: {
		user: { id: string };
		session: { activeOrganizationId?: string | null };
	} | null;
};
const authScope = (session: AuthSession) =>
	dictationScopeKey(
		session.data?.user.id ?? null,
		session.data?.session.activeOrganizationId ?? null,
	);
let activeScope = authScope(authClient.$store.atoms.session.get());
sessions.setScope(activeScope);
authClient.$store.atoms.session.listen((session: AuthSession) => {
	const next = authScope(session);
	if (next === activeScope) return;
	activeScope = next;
	composers.clear();
	sessions.setScope(next);
});

function sessionFor(draftKey: string, queryClient: QueryClient) {
	return sessions.get(draftKey, (key) =>
		createDictationSession({
			transcribe: (audio, target) =>
				transcribeHostDictation(audio, target, {
					queryClient,
					readAudio: (uri) => new File(uri).base64(),
					transcribe: (hostUrl, encoded) =>
						getHostServiceClientByUrl(hostUrl).dictation.transcribe.mutate({
							audio: encoded,
							mediaType: "audio/mp4",
						}),
				}),
			append: async (text) => {
				const composer = composers.get(key)?.current;
				if (composer) {
					await composer.appendDraft(text);
					return;
				}
				const store = useComposerDraftsStore.getState();
				const previous = store.draftsByKey[draftKey]?.text ?? "";
				store.setText(draftKey, previous ? `${previous} ${text}` : text);
			},
			remove: (uri) => new File(uri).delete(),
		}),
	);
}

export function useHostDictation({
	target,
	draftKey,
	composerRef,
}: {
	target: DictationTarget | null;
	draftKey: string;
	composerRef: RefObject<ComposerHandle | null>;
}) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const { data: authSession } = useSession();
	const scope = dictationScopeKey(
		authSession?.user.id ?? null,
		authSession?.session.activeOrganizationId ?? null,
	);
	const recordingTarget = useRef<{
		scope: string;
		target: DictationTarget | null;
	} | null>(null);
	const query = useQuery({
		queryKey: [
			"host-service",
			"superwhisper",
			target?.machineId,
			target?.hostUrl,
		],
		enabled: target !== null,
		staleTime: 0,
		refetchOnWindowFocus: "always",
		networkMode: "always",
		retry: false,
		queryFn: async () => {
			if (!target) return { enabled: false, installed: false };
			try {
				return await getHostServiceClientByUrl(
					target.hostUrl,
				).settings.superwhisper.get.query();
			} catch (error) {
				if (isTrpcErrorWithData(error) && error.data.code === "NOT_FOUND") {
					return { enabled: false, installed: false };
				}
				throw error;
			}
		},
	});
	const { key: sessionKey, session } = sessionFor(draftKey, queryClient);
	const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
	const engine = dictationEngineFor(target, query);

	const errorText = (error: unknown) => {
		const kind = (error as { data?: { dictation?: { kind?: string } } })?.data
			?.dictation?.kind;
		switch (kind) {
			case "DISABLED":
				return t({
					message: "Superwhisper dictation is disabled on this Mac.",
				});
			case "UNAVAILABLE":
				return t({ message: "Superwhisper is not installed on this Mac." });
			case "MODE_NOT_READY":
				return t({
					message: "The Superset mode in Superwhisper is not ready.",
				});
			case "INVALID_AUDIO":
				return t({ message: "Superwhisper could not read the recording." });
			case "TIMEOUT":
				return t({
					message:
						"Superwhisper did not respond in time. Check that it has a Pro license on your Mac.",
				});
			case "RESTORE_FAILED":
				return t({
					message:
						"Superwhisper could not restore your Mac's mode or clipboard.",
				});
			case "TRANSCRIPTION_FAILED":
				return t({
					message: "Superwhisper could not transcribe the recording.",
				});
			default:
				return t({ message: "Could not reach the Mac for transcription." });
		}
	};
	const showFailure = () => {
		if (state.status !== "failed") return;
		Alert.alert(
			t({ message: "Transcription failed" }),
			errorText(state.error),
			[
				{
					text: t({ message: "Abandon" }),
					style: "destructive",
					onPress: session.abandon,
				},
				{ text: t({ message: "Retry" }), onPress: () => void session.retry() },
			],
			{ cancelable: false },
		);
	};
	const onFailed = useEffectEvent(showFailure);
	useEffect(() => {
		if (state.status === "failed") onFailed();
	}, [state]);
	useEffect(() => {
		composers.set(sessionKey, composerRef);
		return () => {
			if (composers.get(sessionKey) === composerRef)
				composers.delete(sessionKey);
		};
	}, [sessionKey, composerRef]);

	const name =
		state.status === "idle" ? target?.hostName : state.target.hostName;
	return {
		dictationEngine: engine === "file" ? ("file" as const) : ("apple" as const),
		dictationRemoteBusy: state.status !== "idle",
		dictationBlocked: engine === "waiting" || state.status !== "idle",
		dictationStatus:
			state.status === "transcribing"
				? t({ message: `Transcription on ${name}` })
				: state.status === "failed"
					? t({ message: "Transcription failed" })
					: engine === "waiting"
						? query.isError
							? t({ message: "Could not check dictation settings" })
							: t({ message: "Checking dictation settings" })
						: "",
		onDictationStart: () => {
			recordingTarget.current = { scope, target };
		},
		onDictationAudio: (audio: DictationAudio) => {
			const recording = recordingTarget.current;
			recordingTarget.current = null;
			if (recording?.scope === activeScope && recording.target)
				session.accept(audio, recording.target);
			else {
				try {
					new File(audio.uri).delete();
				} catch {}
			}
		},
		onDictationStatusPress: () => {
			if (state.status === "failed") showFailure();
			else if (query.isError) {
				Alert.alert(
					t({ message: "Could not check dictation settings" }),
					undefined,
					[
						{ text: t({ message: "Cancel" }), style: "cancel" },
						{
							text: t({ message: "Retry" }),
							onPress: () => void query.refetch(),
						},
					],
				);
			}
		},
	};
}
