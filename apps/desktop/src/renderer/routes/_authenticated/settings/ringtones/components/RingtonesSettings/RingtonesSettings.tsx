import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiArrowPath, HiCheck, HiPlay, HiPlus, HiStop } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import {
	AVAILABLE_RINGTONES,
	type Ringtone,
	useSelectedRingtoneId,
	useSetRingtone,
} from "renderer/stores";
import { CUSTOM_RINGTONE_ID } from "shared/ringtones";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { VolumeDropdown } from "./components/VolumeDropdown";

function formatDuration(seconds: number): string {
	return `${seconds}s`;
}

interface RingtoneRowProps {
	ringtone: Ringtone;
	isSelected: boolean;
	isPlaying: boolean;
	onSelect: () => void;
	onTogglePlay: () => void;
}

function RingtoneRow({
	ringtone,
	isSelected,
	isPlaying,
	onSelect,
	onTogglePlay,
}: RingtoneRowProps) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: div role=button needed so the inner play button can be nested
		<div
			role="button"
			tabIndex={0}
			aria-pressed={isSelected}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect();
				}
			}}
			className={cn(
				"flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
				isSelected ? "bg-accent/40" : "hover:bg-muted/50",
			)}
		>
			<span className="text-xl shrink-0 w-7 text-center leading-none">
				{ringtone.emoji}
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium truncate">{ringtone.name}</span>
					{ringtone.duration && (
						<span className="text-xs text-muted-foreground tabular-nums shrink-0">
							{formatDuration(ringtone.duration)}
						</span>
					)}
				</div>
				<div className="text-xs text-muted-foreground truncate">
					{ringtone.description}
				</div>
			</div>
			<div className="w-5 flex justify-center shrink-0">
				{isSelected && <HiCheck className="h-4 w-4 text-primary" />}
			</div>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onTogglePlay();
				}}
				aria-label={
					isPlaying ? `Stop ${ringtone.name}` : `Play ${ringtone.name}`
				}
				className={cn(
					"h-7 w-7 rounded-full flex items-center justify-center transition-colors border shrink-0",
					isPlaying
						? "bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90"
						: "text-foreground border-border hover:bg-accent",
				)}
			>
				{isPlaying ? (
					<HiStop className="h-3.5 w-3.5" />
				) : (
					<HiPlay className="h-3.5 w-3.5 ml-0.5" />
				)}
			</button>
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

	const utils = electronTrpc.useUtils();
	const { data: customRingtoneData } =
		electronTrpc.ringtone.getCustom.useQuery();
	const { data: isMutedData, isLoading: isMutedLoading } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();
	const { data: volumeData } =
		electronTrpc.settings.getNotificationVolume.useQuery();
	const isMuted = isMutedData ?? false;
	const volume = volumeData ?? 100;
	const customRingtone: Ringtone | null = customRingtoneData
		? {
				...customRingtoneData,
				filename: "",
				color: "from-slate-400 to-slate-500",
			}
		: null;
	const ringtoneOptions = customRingtone
		? [...AVAILABLE_RINGTONES, customRingtone]
		: AVAILABLE_RINGTONES;

	const setMuted = electronTrpc.settings.setNotificationSoundsMuted.useMutation(
		{
			onMutate: async ({ muted }) => {
				await utils.settings.getNotificationSoundsMuted.cancel();
				const previous = utils.settings.getNotificationSoundsMuted.getData();
				utils.settings.getNotificationSoundsMuted.setData(undefined, muted);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getNotificationSoundsMuted.setData(
						undefined,
						context.previous,
					);
				}
			},
		},
	);
	const importCustomRingtone = electronTrpc.ringtone.importCustom.useMutation({
		onError: (error) => {
			console.error("Failed to import custom ringtone:", error);
		},
		onSuccess: async (result) => {
			if (result.canceled) {
				return;
			}
			await utils.ringtone.getCustom.invalidate();
			setRingtone(CUSTOM_RINGTONE_ID);
		},
	});

	const handleMutedToggle = (enabled: boolean) => {
		setMuted.mutate({ muted: !enabled });
	};

	const handleImportCustomRingtone = useCallback(() => {
		importCustomRingtone.mutate();
	}, [importCustomRingtone]);

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
					ringtoneId: ringtone.id,
					volume,
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
		[playingId, volume],
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
					Sounds and ringtone for completed tasks
				</p>
			</div>

			<div className="space-y-6">
				{/* Sound Toggle */}
				{showNotification && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label
								htmlFor="notification-sounds"
								className="text-sm font-medium"
							>
								Notification sounds
							</Label>
							<p className="text-xs text-muted-foreground">
								Play a sound when tasks complete
							</p>
						</div>
						<Switch
							id="notification-sounds"
							checked={!isMuted}
							onCheckedChange={handleMutedToggle}
							disabled={isMutedLoading || setMuted.isPending}
						/>
					</div>
				)}

				{/* Volume Dropdown */}
				{showNotification && !isMuted && <VolumeDropdown />}

				{/* Ringtone Section */}
				{showNotification && !isMuted && (
					<div>
						<div className="mb-3 flex items-start justify-between gap-2">
							<div>
								<h3 className="text-sm font-medium mb-1">Notification sound</h3>
								<p className="text-xs text-muted-foreground">
									Pick a sound or add your own. Custom audio supports .mp3,
									.wav, and .ogg.
								</p>
							</div>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={handleImportCustomRingtone}
								disabled={importCustomRingtone.isPending}
							>
								{customRingtone ? (
									<HiArrowPath className="mr-1.5 h-3.5 w-3.5" />
								) : (
									<HiPlus className="mr-1.5 h-3.5 w-3.5" />
								)}
								{customRingtone ? "Replace custom audio" : "Add custom audio"}
							</Button>
						</div>
						<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
							{ringtoneOptions.map((ringtone) => (
								<RingtoneRow
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
			</div>
		</div>
	);
}
