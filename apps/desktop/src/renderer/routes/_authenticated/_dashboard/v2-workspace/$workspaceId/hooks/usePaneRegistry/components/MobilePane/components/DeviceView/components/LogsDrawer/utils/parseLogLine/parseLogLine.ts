export type LogLevel = "debug" | "info" | "default" | "error" | "fault";

export interface LogEntry {
	id: string;
	time: string;
	process: string;
	level: LogLevel;
	message: string;
}

const IOS_LEVELS: Record<string, LogLevel> = {
	Debug: "debug",
	Info: "info",
	Default: "default",
	Error: "error",
	Fault: "fault",
};

interface IosLogEvent {
	timestamp?: string;
	processImagePath?: string;
	messageType?: string;
	eventMessage?: string;
}

export function parseIosEvent(data: string, id: string): LogEntry | null {
	const event = JSON.parse(data) as IosLogEvent;
	if (!event.eventMessage) return null;
	return {
		id,
		time: event.timestamp?.split(" ")[1]?.slice(0, 12) ?? "",
		process: event.processImagePath?.split("/").at(-1) ?? "",
		level: IOS_LEVELS[event.messageType ?? ""] ?? "default",
		message: event.eventMessage,
	};
}

const ANDROID_LEVELS: Record<string, LogLevel> = {
	V: "debug",
	D: "debug",
	I: "info",
	W: "default",
	E: "error",
	F: "fault",
};

const LOGCAT_LINE =
	/^\d\d-\d\d (\d\d:\d\d:\d\d\.\d{3})\s+\d+\s+\d+ ([VDIWEF]) (.*?)\s*: (.*)$/;

export function parseAndroidLine(line: string, id: string): LogEntry {
	const match = LOGCAT_LINE.exec(line);
	if (!match) {
		return { id, time: "", process: "", level: "default", message: line };
	}
	const [, time = "", level = "", tag = "", message = ""] = match;
	return {
		id,
		time,
		process: tag,
		level: ANDROID_LEVELS[level] ?? "default",
		message,
	};
}
