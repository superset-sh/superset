import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useEffect } from "react";
import { HiMiniMicrophone } from "react-icons/hi2";
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

	// Auto-dismiss after done or error
	useEffect(() => {
		if (status === "done" || status === "error") {
			const timer = setTimeout(() => {
				toast.dismiss(toastId);
			}, 8000);
			return () => clearTimeout(timer);
		}
	}, [status, toastId]);

	const handleStop = () => {
		abort();
	};

	const isActive =
		status === "transcribing" ||
		status === "processing" ||
		status === "streaming";

	return (
		<div className="flex flex-col bg-popover text-popover-foreground rounded-lg border border-border shadow-lg min-w-[380px] max-w-[480px]">
			<div className="flex flex-col gap-2 p-4">
				{/* Header */}
				<div className="flex items-center gap-2">
					<HiMiniMicrophone className="size-4 text-primary" />
					<span className="text-sm font-medium">Voice Command</span>
				</div>

				{/* Status indicator */}
				{status === "transcribing" && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<span className="relative flex size-2">
							<span className="absolute inline-flex size-full animate-ping rounded-full bg-foreground/75" />
							<span className="relative inline-flex size-2 rounded-full bg-foreground" />
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
								<span className="size-1.5 rounded-full bg-muted-foreground" />
								<span className="font-mono">{tc.toolName}</span>
								{tc.result && <span className="text-foreground">done</span>}
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
							<span className="absolute inline-flex size-full animate-ping rounded-full bg-muted-foreground/75" />
							<span className="relative inline-flex size-2 rounded-full bg-muted-foreground" />
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

			{/* Stop button footer */}
			{isActive && (
				<div className="flex justify-end border-t border-border px-4 py-2">
					<Button variant="ghost" size="sm" onClick={handleStop}>
						Stop
					</Button>
				</div>
			)}
		</div>
	);
}
