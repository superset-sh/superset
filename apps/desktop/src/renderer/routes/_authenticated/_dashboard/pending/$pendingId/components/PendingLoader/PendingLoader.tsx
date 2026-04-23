import {
	KeypadLoader,
	type ProgressStep,
} from "renderer/components/KeypadLoader";
import { StepProgress } from "renderer/components/StepProgress";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface PendingLoaderProps {
	steps: ProgressStep[];
}

export function PendingLoader({ steps }: PendingLoaderProps) {
	const { data: notificationSoundsMuted = true } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();
	const { data: notificationVolume = 100 } =
		electronTrpc.settings.getNotificationVolume.useQuery();

	return (
		<div className="flex flex-col items-center space-y-5">
			<KeypadLoader
				steps={steps}
				muted={notificationSoundsMuted}
				volume={0.35 * (notificationVolume / 100)}
			/>
			<StepProgress steps={steps} />
		</div>
	);
}
