import { msg } from "@lingui/core/macro";

export const MAX_FILES = 5;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const AGENTS_WEB_PREVIEW_MESSAGE = msg({
	id: "web.agents.previewNotice",
	message: "The web agents UI is a read-only preview for now.",
});

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;
