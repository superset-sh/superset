import { toast } from "@superset/ui/sonner";
import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { RecordingIndicator } from "./components/RecordingIndicator";
import { ResponsePanel } from "./components/ResponsePanel";

/**
 * Single component that queries the voiceCommandsEnabled setting and
 * passes it as the `enabled` flag to `useSubscription`. This avoids
 * conditional rendering / mount-unmount cycles — the subscription hook
 * is always called (React rules-of-hooks) but only connects when the
 * setting is true.
 */
export function VoiceListener() {
	const { data: voiceEnabled } =
		electronTrpc.settings.getVoiceCommandsEnabled.useQuery();

	const { data: micPermission } = electronTrpc.voice.getMicPermission.useQuery(
		undefined,
		{
			refetchOnWindowFocus: true,
		},
	);

	const canListen = !!voiceEnabled && micPermission === "granted";

	const indicatorToastRef = useRef<string | number | null>(null);
	const responseToastRef = useRef<string | number | null>(null);

	// Dismiss any lingering toasts when voice is disabled or permission revoked
	useEffect(() => {
		if (!canListen) {
			dismissAll(indicatorToastRef, responseToastRef);
		}
	}, [canListen]);

	electronTrpc.voice.subscribe.useSubscription(undefined, {
		enabled: canListen,
		onData: (event) => {
			switch (event.type) {
				case "recording": {
					dismissAll(indicatorToastRef, responseToastRef);

					const toastId = toast.custom(
						(id) => <RecordingIndicator toastId={id} />,
						{
							duration: Number.POSITIVE_INFINITY,
							position: "bottom-center",
							unstyled: true,
						},
					);
					indicatorToastRef.current = toastId;
					break;
				}

				case "audio_captured": {
					if (indicatorToastRef.current !== null) {
						toast.dismiss(indicatorToastRef.current);
						indicatorToastRef.current = null;
					}

					const toastId = toast.custom(
						(id) => <ResponsePanel toastId={id} audioB64={event.audioB64} />,
						{
							duration: Number.POSITIVE_INFINITY,
							position: "bottom-center",
							unstyled: true,
						},
					);
					responseToastRef.current = toastId;
					break;
				}

				case "idle": {
					if (indicatorToastRef.current !== null) {
						toast.dismiss(indicatorToastRef.current);
						indicatorToastRef.current = null;
					}
					break;
				}

				case "error": {
					dismissAll(indicatorToastRef, responseToastRef);
					console.error("[voice-listener] Sidecar error:", event.message);
					break;
				}
			}
		},
		onError: (error) => {
			console.error("[voice-listener] Subscription error:", error);
		},
	});

	return null;
}

function dismissAll(...refs: React.RefObject<string | number | null>[]): void {
	for (const ref of refs) {
		if (ref.current !== null) {
			toast.dismiss(ref.current);
			ref.current = null;
		}
	}
}
