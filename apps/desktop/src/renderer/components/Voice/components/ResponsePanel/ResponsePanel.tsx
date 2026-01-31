import { toast } from "@superset/ui/sonner";
import { useEffect } from "react";
import { HiMiniMicrophone, HiMiniXMark } from "react-icons/hi2";
import { useVoicePipeline } from "./hooks/useVoicePipeline";

interface ResponsePanelProps {
	toastId: string | number;
	audioB64: string;
}

export function ResponsePanel({ toastId, audioB64 }: ResponsePanelProps) {
	const {
		status,
		transcription,
		toolCalls,
		responseText,
		error,
		processAudio,
		abort,
	} = useVoicePipeline();

	// Start processing when mounted
	useEffect(() => {
		processAudio(audioB64);
	}, [audioB64, processAudio]);

	// Auto-dismiss after done
	useEffect(() => {
		if (status === "done") {
			const timer = setTimeout(() => {
				toast.dismiss(toastId);
			}, 8000);
			return () => clearTimeout(timer);
		}
	}, [status, toastId]);

	const handleDismiss = () => {
		abort();
		toast.dismiss(toastId);
	};

	return (
		<div className="relative flex flex-col gap-2 bg-popover text-popover-foreground rounded-lg border border-border p-4 shadow-lg min-w-[380px] max-w-[480px]">
			<button
				type="button"
				onClick={handleDismiss}
				className="absolute top-2 right-2 size-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
				aria-label="Dismiss"
			>
				<HiMiniXMark className="size-4" />
			</button>

			{/* Header */}
			<div className="flex items-center gap-2">
				<HiMiniMicrophone className="size-4 text-primary" />
				<span className="text-sm font-medium">Voice Command</span>
			</div>

			{/* Status indicator */}
			{status === "transcribing" && (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<span className="relative flex size-2">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
						<span className="relative inline-flex size-2 rounded-full bg-blue-500" />
					</span>
					Transcribing...
				</div>
			)}

			{/* Transcription */}
			{transcription && (
				<div className="text-sm text-muted-foreground italic">
					&ldquo;{transcription}&rdquo;
				</div>
			)}

			{/* Tool calls */}
			{toolCalls.length > 0 && (
				<div className="flex flex-col gap-1">
					{toolCalls.map((tc, i) => (
						<div
							key={`${tc.toolName}-${i}`}
							className="flex items-center gap-1.5 text-xs text-muted-foreground"
						>
							<span className="size-1.5 rounded-full bg-amber-400" />
							<span className="font-mono">{tc.toolName}</span>
							{tc.result && <span className="text-green-500">done</span>}
						</div>
					))}
				</div>
			)}

			{/* Streaming response */}
			{(status === "streaming" || status === "done") && responseText && (
				<div className="text-sm leading-relaxed whitespace-pre-wrap">
					{responseText}
					{status === "streaming" && (
						<span className="inline-block w-1 h-4 ml-0.5 bg-foreground animate-pulse" />
					)}
				</div>
			)}

			{/* Processing indicator */}
			{status === "processing" && !responseText && (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<span className="relative flex size-2">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
						<span className="relative inline-flex size-2 rounded-full bg-amber-500" />
					</span>
					Thinking...
				</div>
			)}

			{/* Error */}
			{status === "error" && (
				<div className="text-sm text-destructive">
					{error || "Something went wrong"}
				</div>
			)}
		</div>
	);
}
