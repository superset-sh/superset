import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

const VOLUME_LEVELS = [
	{ value: 20, label: "Quiet" },
	{ value: 40, label: "Low" },
	{ value: 60, label: "Medium" },
	{ value: 80, label: "High" },
	{ value: 100, label: "Maximum" },
] as const;

function getVolumeLabel(volume: number): string {
	const level = VOLUME_LEVELS.find((l) => l.value === volume);
	return level ? level.label : "Custom";
}

export function VolumeDropdown() {
	const utils = electronTrpc.useUtils();
	const { data: volumeData, isLoading: volumeLoading } =
		electronTrpc.settings.getNotificationVolume.useQuery();
	const volume = volumeData ?? 100;

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
		},
		onSettled: async () => {
			await utils.settings.getNotificationVolume.invalidate();
		},
	});

	const handleVolumeChange = useCallback(
		(value: string) => {
			const newVolume = Number.parseInt(value, 10);
			setVolume.mutate({ volume: newVolume });
		},
		[setVolume],
	);

	return (
		<div>
			<div className="flex items-center justify-between gap-4">
				<Label htmlFor="notification-volume" className="text-sm font-medium">
					Volume
				</Label>
				<Select
					value={volume.toString()}
					onValueChange={handleVolumeChange}
					disabled={volumeLoading}
				>
					<SelectTrigger id="notification-volume" className="w-[200px]">
						<SelectValue>
							<span className="flex items-center gap-2">
								<span className="font-medium">{getVolumeLabel(volume)}</span>
								<span className="text-muted-foreground">({volume}%)</span>
							</span>
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{VOLUME_LEVELS.map((level) => (
							<SelectItem key={level.value} value={level.value.toString()}>
								<div className="flex items-center gap-2">
									<span className="font-medium">{level.label}</span>
									<span className="text-muted-foreground text-xs">
										({level.value}%)
									</span>
								</div>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
