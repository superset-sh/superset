import { useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getRingtoneUrl } from "renderer/lib/ringtone-urls";

export function RingtonePlayer() {
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const stopPlayback = () => {
		if (!audioRef.current) return;
		audioRef.current.pause();
		audioRef.current.currentTime = 0;
	};

	const playPlayback = (filename: string) => {
		const url = getRingtoneUrl(filename);
		if (!url) {
			console.warn("[ringtone] Missing URL for filename:", filename);
			return;
		}

		if (!audioRef.current) {
			audioRef.current = new Audio();
		}

		const audio = audioRef.current;
		audio.pause();
		audio.src = url;
		audio.currentTime = 0;
		audio.volume = 1;
		audio.play().catch((error) => {
			console.warn("[ringtone] Failed to play audio:", error);
		});
	};

	// Subscribe to ringtone events via tRPC
	electronTrpc.ringtone.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "play") {
				playPlayback(event.filename);
			} else if (event.type === "stop") {
				stopPlayback();
			}
		},
	});

	useEffect(() => {
		return () => {
			stopPlayback();
		};
	}, []);

	return null;
}
