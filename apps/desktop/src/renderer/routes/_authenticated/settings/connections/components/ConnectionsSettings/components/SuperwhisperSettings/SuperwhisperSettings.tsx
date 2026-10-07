import { Trans } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { HostSelect } from "../../../../../components/HostSelect";
import { useMacHostOptions } from "../../../../../hooks/useMacHostOptions";
import { SuperwhisperControls } from "./components/SuperwhisperControls";

export function SuperwhisperSettings({ hostId }: { hostId: string | null }) {
	const navigate = useNavigate();
	const { options } = useMacHostOptions();
	const selectedHost =
		options.find((option) => option.id === hostId) ??
		options.find((option) => option.isLocal) ??
		options[0];
	const targetHostUrl = useHostUrl(selectedHost?.id);

	if (!selectedHost) return null;

	return (
		<section>
			<header className="flex items-center justify-between gap-4">
				<h3 className="text-base font-semibold">
					<Trans>Superwhisper</Trans>
				</h3>
				<HostSelect
					value={selectedHost.id}
					options={options}
					onValueChange={(nextHostId) => {
						void navigate({
							to: "/settings/connections",
							search: { hostId: nextHostId },
							replace: true,
						});
					}}
				/>
			</header>
			<SuperwhisperControls
				hostUrl={targetHostUrl}
				enabled={selectedHost.isOnline}
			/>
		</section>
	);
}
