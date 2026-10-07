import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import {
	LuCopy,
	LuDownload,
	LuPause,
	LuPlay,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { DeviceControlButton } from "../DeviceControlButton";
import { LogLevelMenu } from "./components/LogLevelMenu";
import { LogRow } from "./components/LogRow";
import { type LogScope, useDeviceLogs } from "./hooks/useDeviceLogs";
import type { LogEntry, LogLevel } from "./utils/parseLogLine";

interface LogsDrawerProps {
	hubUrl: string;
	platform: "ios" | "android";
	deviceId: string;
	deviceName: string;
	onClose: () => void;
}

const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 120;

const asText = (logs: LogEntry[]) =>
	logs.map((log) => [log.time, log.process, log.message].join("\t")).join("\n");

export function LogsDrawer({
	hubUrl,
	platform,
	deviceId,
	deviceName,
	onClose,
}: LogsDrawerProps) {
	const { t } = useLingui();
	const [scope, setScope] = useState<LogScope>("all");
	const [paused, setPaused] = useState(false);
	const [filter, setFilter] = useState("");
	const [hiddenLevels, setHiddenLevels] = useState<ReadonlySet<LogLevel>>(
		new Set(),
	);
	const [height, setHeight] = useState(DEFAULT_HEIGHT);
	const { logs, clear, connected } = useDeviceLogs({
		hubUrl,
		platform,
		deviceId,
		scope,
		paused,
	});

	const needle = filter.trim().toLowerCase();
	const visible = logs.filter(
		(log) =>
			!hiddenLevels.has(log.level) &&
			(!needle ||
				log.message.toLowerCase().includes(needle) ||
				log.process.toLowerCase().includes(needle)),
	);

	const listRef = useRef<HTMLDivElement>(null);
	const pinnedToBottom = useRef(true);
	const lastId = visible.at(-1)?.id;
	// biome-ignore lint/correctness/useExhaustiveDependencies: follow the newest line
	useEffect(() => {
		const list = listRef.current;
		if (list && pinnedToBottom.current) list.scrollTop = list.scrollHeight;
	}, [lastId]);

	const resize = (event: PointerEvent<HTMLDivElement>) => {
		const handle = event.currentTarget;
		const container = handle.parentElement?.parentElement;
		if (!container) return;
		handle.setPointerCapture(event.pointerId);
		const bottom = container.getBoundingClientRect().bottom;
		const max = container.clientHeight * 0.8;
		const move = (moveEvent: globalThis.PointerEvent) =>
			setHeight(
				Math.min(max, Math.max(MIN_HEIGHT, bottom - moveEvent.clientY)),
			);
		const stop = () => {
			handle.removeEventListener("pointermove", move);
			handle.removeEventListener("pointerup", stop);
		};
		handle.addEventListener("pointermove", move);
		handle.addEventListener("pointerup", stop);
	};

	const download = () => {
		const url = URL.createObjectURL(
			new Blob([asText(visible)], { type: "text/plain" }),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${deviceName}-${Date.now()}.log`;
		link.click();
		URL.revokeObjectURL(url);
	};

	const scopeButton = (value: LogScope, label: string, disabled = false) => (
		<Button
			variant={scope === value ? "secondary" : "ghost"}
			size="xs"
			aria-pressed={scope === value}
			disabled={disabled}
			onClick={() => setScope(value)}
			className="h-6 px-2"
		>
			{label}
		</Button>
	);

	return (
		<aside
			className="absolute inset-x-0 bottom-0 z-20 flex max-h-[80%] min-w-0 flex-col overflow-hidden border-t bg-background"
			style={{ height }}
		>
			<div
				aria-hidden="true"
				onPointerDown={resize}
				className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-row-resize touch-none"
			/>
			<div className="flex h-9 shrink-0 items-center gap-1.5 border-b pr-1 pl-3">
				<span className="text-xs font-medium">
					<Trans>Logs</Trans>
				</span>
				<span
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						connected && !paused ? "bg-green-500" : "bg-muted-foreground/40",
					)}
				/>
				{scopeButton("all", t({ message: "All", context: "log scope" }))}
				{scopeButton(
					"app",
					t({ message: "App", context: "log scope" }),
					platform !== "ios",
				)}
				<Input
					type="text"
					aria-label={t({ message: "Filter logs" })}
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
					placeholder={t({ message: "Filter" })}
					className="ml-auto h-7 w-40 text-xs"
				/>
				<div className="flex shrink-0 items-center">
					<LogLevelMenu
						hidden={hiddenLevels}
						onToggle={(level) =>
							setHiddenLevels((current) => {
								const next = new Set(current);
								if (!next.delete(level)) next.add(level);
								return next;
							})
						}
					/>
					<DeviceControlButton
						label={t({ message: "Download logs" })}
						side="top"
						compact
						disabled={visible.length === 0}
						onClick={download}
					>
						<LuDownload className="size-3.5" />
					</DeviceControlButton>
					<DeviceControlButton
						label={t({ message: "Copy logs" })}
						side="top"
						compact
						disabled={visible.length === 0}
						onClick={() => void navigator.clipboard.writeText(asText(visible))}
					>
						<LuCopy className="size-3.5" />
					</DeviceControlButton>
					<DeviceControlButton
						label={t({ message: "Clear" })}
						side="top"
						compact
						onClick={clear}
					>
						<LuTrash2 className="size-3.5" />
					</DeviceControlButton>
					<DeviceControlButton
						label={paused ? t({ message: "Resume" }) : t({ message: "Pause" })}
						side="top"
						compact
						onClick={() => setPaused((value) => !value)}
					>
						{paused ? (
							<LuPlay className="size-3.5" />
						) : (
							<LuPause className="size-3.5" />
						)}
					</DeviceControlButton>
					<DeviceControlButton
						label={t({ message: "Close logs" })}
						side="top"
						compact
						onClick={onClose}
					>
						<LuX className="size-3.5" />
					</DeviceControlButton>
				</div>
			</div>
			<div
				ref={listRef}
				onScroll={(event) => {
					const list = event.currentTarget;
					pinnedToBottom.current =
						list.scrollHeight - list.scrollTop - list.clientHeight < 24;
				}}
				className="min-h-0 flex-1 select-text overflow-auto py-1"
			>
				{visible.length === 0 ? (
					<div className="flex h-full items-center justify-center text-xs text-muted-foreground">
						<Trans>No log lines yet</Trans>
					</div>
				) : (
					visible.map((entry) => <LogRow key={entry.id} entry={entry} />)
				)}
			</div>
		</aside>
	);
}
