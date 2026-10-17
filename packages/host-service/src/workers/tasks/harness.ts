// harness/* worker tasks. A handoff reads the source agent's session file,
// which can run to hundreds of megabytes; the read and the JSON.parse of
// every line must stay off the host-service event loop.

import {
	type HarnessTranscript,
	readHarnessTranscript,
} from "../../terminal-agents/harness-sessions/transcript.ts";
import type { HarnessSessionRef } from "../../terminal-agents/harness-sessions/types.ts";
import {
	type AccountResumeHistory,
	inspectNativeResumeHistory,
	type NativeResumeHistoryInput,
} from "../../terminal-agents/saved-conversations/inspect-native-history.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

export const harnessTranscriptTask = defineWorkerTask<
	{ ref: HarnessSessionRef; maxChars: number },
	HarnessTranscript | null
>({
	type: "harness/readTranscript",
	handler: async ({ ref, maxChars }) => readHarnessTranscript(ref, maxChars),
});

export const inspectSavedConversationTask = defineWorkerTask<
	NativeResumeHistoryInput,
	AccountResumeHistory | null
>({
	type: "harness/inspectSavedConversation",
	handler: inspectNativeResumeHistory,
});

export const harnessTasks = [
	harnessTranscriptTask,
	inspectSavedConversationTask,
];
