import {
	ExpoSpeechRecognitionModule,
	useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useState } from "react";
import { Alert } from "react-native";

export function useVoiceDictation(onTranscript: (text: string) => void) {
	const [recording, setRecording] = useState(false);

	useSpeechRecognitionEvent("result", (event) => {
		const transcript = event.results[0]?.transcript;
		if (transcript) onTranscript(transcript);
	});
	useSpeechRecognitionEvent("end", () => setRecording(false));
	useSpeechRecognitionEvent("error", (event) => {
		setRecording(false);
		if (event.error === "not-allowed") {
			Alert.alert("Microphone access is not allowed");
		}
	});

	const start = async () => {
		const permission =
			await ExpoSpeechRecognitionModule.requestPermissionsAsync();
		if (!permission.granted) {
			Alert.alert("Microphone access is not allowed");
			return;
		}
		setRecording(true);
		ExpoSpeechRecognitionModule.start({
			interimResults: true,
		});
	};

	const stop = () => {
		ExpoSpeechRecognitionModule.stop();
	};

	return { recording, start, stop };
}
