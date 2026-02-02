import { useEffect, useRef } from "react";
import { getRingtoneUrl } from "renderer/lib/ringtone-urls";

const PLAY_CHANNEL = "ringtone-play";
const STOP_CHANNEL = "ringtone-stop";

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

	useEffect(() => {
		const handlePlay = (filename?: string) => {
			if (typeof filename !== "string") return;
			playPlayback(filename);
		};

		const handleStop = () => {
			stopPlayback();
		};

		window.ipcRenderer.on(PLAY_CHANNEL, handlePlay);
		window.ipcRenderer.on(STOP_CHANNEL, handleStop);

		return () => {
			window.ipcRenderer.off(PLAY_CHANNEL, handlePlay);
			window.ipcRenderer.off(STOP_CHANNEL, handleStop);
			stopPlayback();
		};
	}, []);

	return null;
}
