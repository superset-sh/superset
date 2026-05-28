export const VOICE_DICTATION_INSERT_EVENT = "superset:voice-dictation-insert";

export type VoiceDictationInsertDetail = {
	text: string;
	handled: boolean;
};
