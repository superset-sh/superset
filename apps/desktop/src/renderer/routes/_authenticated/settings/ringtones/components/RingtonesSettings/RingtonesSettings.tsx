import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiBellSlash, HiCheck, HiPlay, HiStop } from "react-icons/hi2";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	AVAILABLE_RINGTONES,
	type Ringtone,
	useSelectedRingtoneId,
	useSetRingtone,
} from "renderer/stores";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

function formatDuration(seconds: number): string {
	return `${seconds}s`;
}

interface RingtoneCardProps {
	ringtone: Ringtone;
	isSelected: boolean;
	isPlaying: boolean;
	onSelect: () => void;
	onTogglePlay: () => void;
}

function RingtoneCard({
	ringtone,
	isSelected,
	isPlaying,
	onSelect,
	onTogglePlay,
}: RingtoneCardProps) {
	const isSilent = ringtone.id === "none";

	// Silent card has a distinct style
	if (isSilent) {
		return (
			<button
				type="button"
				onClick={onSelect}
				className={cn(
					"relative flex flex-col rounded-lg border-2 overflow-hidden transition-all text-left",
					isSelected
						? "border-primary ring-2 ring-primary/20"
						: "border-dashed border-border hover:border-muted-foreground/50",
				)}
			>
				{/* Preview area */}
				<div
					className={cn(
						"h-24 flex flex-col items-center justify-center relative gap-1",
						isSelected ? "bg-accent/50" : "bg-muted/20",
					)}
				>
					<HiBellSlash className="h-8 w-8 text-muted-foreground" />
					<span className="text-xs text-muted-foreground">No sound</span>
				</div>

				{/* Info */}
				<div className="p-3 bg-card border-t flex items-center justify-between">
					<div>
						<div className="text-sm font-medium">{ringtone.name}</div>
						<div className="text-xs text-muted-foreground">
							{ringtone.description}
						</div>
					</div>
					{isSelected && (
						<div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
							<HiCheck className="h-3 w-3 text-primary-foreground" />
						</div>
					)}
				</div>
			</button>
		);
	}

	return (
		// biome-ignore lint/a11y/useSemanticElements: Using div with role="button" to allow nested play/stop button
		<div
			role="button"
			tabIndex={0}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect();
				}
			}}
			className={cn(
				"relative flex flex-col rounded-lg border-2 overflow-hidden transition-all text-left cursor-pointer",
				isSelected
					? "border-primary ring-2 ring-primary/20"
					: "border-border hover:border-muted-foreground/50",
			)}
		>
			{/* Preview area */}
			<div
				className={cn(
					"h-24 flex items-center justify-center relative",
					isSelected ? "bg-accent/50" : "bg-muted/30",
				)}
			>
				{/* Emoji */}
				<span className="text-4xl">{ringtone.emoji}</span>

				{/* Duration badge */}
				{ringtone.duration && (
					<span className="absolute top-2 right-2 text-xs text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded">
						{formatDuration(ringtone.duration)}
					</span>
				)}

				{/* Play/Stop button */}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onTogglePlay();
					}}
					className={cn(
						"absolute bottom-2 right-2 h-8 w-8 rounded-full flex items-center justify-center",
						"transition-colors border",
						isPlaying
							? "bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90"
							: "bg-card text-foreground border-border hover:bg-accent",
					)}
				>
					{isPlaying ? (
						<HiStop className="h-4 w-4" />
					) : (
						<HiPlay className="h-4 w-4 ml-0.5" />
					)}
				</button>
			</div>

			{/* Info */}
			<div className="p-3 bg-card border-t flex items-center justify-between">
				<div>
					<div className="text-sm font-medium">{ringtone.name}</div>
					<div className="text-xs text-muted-foreground">
						{ringtone.description}
					</div>
				</div>
				{isSelected && (
					<div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
						<HiCheck className="h-3 w-3 text-primary-foreground" />
					</div>
				)}
			</div>
		</div>
	);
}

interface RingtonesSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function RingtonesSettings({ visibleItems }: RingtonesSettingsProps) {
	const showNotification = isItemVisible(
		SETTING_ITEM_ID.RINGTONES_NOTIFICATION,
		visibleItems,
	);

	const selectedRingtoneId = useSelectedRingtoneId();
	const setRingtone = useSetRingtone();
	const [playingId, setPlayingId] = useState<string | null>(null);
	const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clean up timer and stop any playing sound on unmount
	useEffect(() => {
		return () => {
			if (previewTimerRef.current) {
				clearTimeout(previewTimerRef.current);
			}
			// Stop any in-progress preview when navigating away
			electronTrpcClient.ringtone.stop.mutate().catch(() => {
				// Ignore errors during cleanup
			});
		};
	}, []);

	const handleTogglePlay = useCallback(
		async (ringtone: Ringtone) => {
			if (ringtone.id === "none" || !ringtone.filename) {
				return;
			}

			// Clear any pending timer
			if (previewTimerRef.current) {
				clearTimeout(previewTimerRef.current);
				previewTimerRef.current = null;
			}

			// If this ringtone is already playing, stop it
			if (playingId === ringtone.id) {
				try {
					await electronTrpcClient.ringtone.stop.mutate();
				} catch (error) {
					console.error("Failed to stop ringtone:", error);
				}
				setPlayingId(null);
				return;
			}

			// Stop any currently playing sound first
			try {
				await electronTrpcClient.ringtone.stop.mutate();
			} catch (error) {
				console.error("Failed to stop ringtone:", error);
			}

			// Play the new sound
			setPlayingId(ringtone.id);

			try {
				await electronTrpcClient.ringtone.preview.mutate({
					filename: ringtone.filename,
				});
			} catch (error) {
				console.error("Failed to play ringtone:", error);
				setPlayingId(null);
			}

			// Auto-reset after the ringtone's actual duration (with 500ms buffer)
			const durationMs = ((ringtone.duration ?? 5) + 0.5) * 1000;
			previewTimerRef.current = setTimeout(() => {
				setPlayingId((current) => (current === ringtone.id ? null : current));
				previewTimerRef.current = null;
			}, durationMs);
		},
		[playingId],
	);

	const handleSelect = useCallback(
		(ringtoneId: string) => {
			setRingtone(ringtoneId);
		},
		[setRingtone],
	);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Notifications</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Choose the notification sound for completed tasks
				</p>
			</div>

			<div className="space-y-8">
				{/* Ringtone Section */}
				{showNotification && (
					<div>
						<h3 className="text-sm font-medium mb-4">Notification Sound</h3>
						<div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
							{AVAILABLE_RINGTONES.map((ringtone) => (
								<RingtoneCard
									key={ringtone.id}
									ringtone={ringtone}
									isSelected={selectedRingtoneId === ringtone.id}
									isPlaying={playingId === ringtone.id}
									onSelect={() => handleSelect(ringtone.id)}
									onTogglePlay={() => handleTogglePlay(ringtone)}
								/>
							))}
						</div>
					</div>
				)}

				{/* Tip */}
				{showNotification && (
					<div className="pt-6 border-t">
						<p className="text-sm text-muted-foreground">
							Click the play button to preview a sound. Click stop or play
							another to stop the current sound.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
