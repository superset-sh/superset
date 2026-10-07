import { useCallback, useEffect, useRef, useState } from "react";
import {
	type LogEntry,
	parseAndroidLine,
	parseIosEvent,
} from "../../utils/parseLogLine";

const MAX_LINES = 1000;

export type LogScope = "all" | "app";

interface UseDeviceLogsOptions {
	hubUrl: string;
	platform: "ios" | "android";
	deviceId: string;
	scope: LogScope;
	paused: boolean;
}

/**
 * hub-client keeps only the message text of each log line, and its Android
 * reader does not match the event format this hub sends. The hub's own
 * streams carry time, process and level, so the drawer reads them directly.
 */
export function useDeviceLogs({
	hubUrl,
	platform,
	deviceId,
	scope,
	paused,
}: UseDeviceLogsOptions) {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [connected, setConnected] = useState(false);
	const sequence = useRef(0);
	const pausedRef = useRef(paused);
	pausedRef.current = paused;

	useEffect(() => {
		const device = encodeURIComponent(deviceId);
		const url =
			platform === "ios"
				? `${hubUrl}/vendor/serve-sim/logs?device=${device}${scope === "app" ? "&scope=user-apps" : ""}`
				: `${hubUrl}/vendor/serve-emu/api/logcat?device=${device}`;
		setLogs([]);
		const source = new EventSource(url);
		const append = (entries: LogEntry[]) => {
			if (pausedRef.current || entries.length === 0) return;
			setLogs((current) => [...current, ...entries].slice(-MAX_LINES));
		};
		const nextId = () => `log-${++sequence.current}`;

		source.onopen = () => setConnected(true);
		source.onerror = () => setConnected(false);
		source.onmessage = (event: MessageEvent<string>) => {
			const entry = parseIosEvent(event.data, nextId());
			if (entry) append([entry]);
		};
		source.addEventListener("logs", (event) => {
			const batch = JSON.parse((event as MessageEvent<string>).data) as {
				lines?: Array<{ line: string }>;
			};
			append(
				(batch.lines ?? []).map(({ line }) => parseAndroidLine(line, nextId())),
			);
		});
		return () => {
			source.close();
			setConnected(false);
		};
	}, [hubUrl, platform, deviceId, scope]);

	const clear = useCallback(() => setLogs([]), []);
	return { logs, clear, connected };
}
