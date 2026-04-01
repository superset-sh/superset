import { Label } from "@superset/ui/label";
import { Slider } from "@superset/ui/slider";
import { useCallback, useEffect, useState } from "react";
import { HiInformationCircle, HiSpeakerWave } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";

const isWindows = process.platform === "win32";

export function VolumeSlider() {
	const [localVolume, setLocalVolume] = useState<number | null>(null);

	const utils = electronTrpc.useUtils();
	const { data: volumeData, isLoading: volumeLoading } =
		electronTrpc.settings.getNotificationVolume.useQuery();
	const volume = localVolume ?? volumeData ?? 100;

	const setVolume = electronTrpc.settings.setNotificationVolume.useMutation({
		onMutate: async ({ volume }) => {
			await utils.settings.getNotificationVolume.cancel();
			const previous = utils.settings.getNotificationVolume.getData();
			utils.settings.getNotificationVolume.setData(undefined, volume);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getNotificationVolume.setData(
					undefined,
					context.previous,
				);
			}
			// Reset local state to re-sync with server on next render
			setLocalVolume(null);
		},
	});

	// Sync local volume when server data changes
	useEffect(() => {
		if (volumeData !== undefined && localVolume === null) {
			setLocalVolume(volumeData);
		}
	}, [volumeData, localVolume]);

	const handleVolumeChange = useCallback((value: number[]) => {
		const newVolume = value[0] ?? 100;
		// Update local state immediately for smooth dragging
		setLocalVolume(newVolume);
	}, []);

	const handleVolumeCommit = useCallback(
		(value: number[]) => {
			const newVolume = value[0] ?? 100;
			// Persist to database when user releases the slider
			setVolume.mutate({ volume: newVolume });
		},
		[setVolume],
	);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<Label htmlFor="notification-volume" className="text-sm font-medium">
					Volume
				</Label>
				<span className="text-sm text-muted-foreground">{volume}%</span>
			</div>
			<div className="flex items-center gap-3">
				<HiSpeakerWave className="h-5 w-5 text-muted-foreground flex-shrink-0" />
				<Slider
					id="notification-volume"
					value={[volume]}
					onValueChange={handleVolumeChange}
					onValueCommit={handleVolumeCommit}
					min={0}
					max={100}
					step={1}
					disabled={volumeLoading}
					className="flex-1"
				/>
			</div>
			{isWindows && (
				<div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded">
					<HiInformationCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
					<p>
						Volume control is not supported on Windows due to system
						limitations. Notifications will play at system volume.
					</p>
				</div>
			)}
		</div>
	);
}
