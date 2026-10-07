import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Badge } from "@superset/ui/badge";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { SettingsRow } from "../../../../../../../components/SettingsRow";
import { isSuperwhisperProcedureUnavailable } from "../../SuperwhisperSettings.utils";

interface SuperwhisperControlsProps {
	hostUrl: string | null;
	enabled: boolean;
}

export function SuperwhisperControls({
	hostUrl,
	enabled,
}: SuperwhisperControlsProps) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const queryKey = ["host-superwhisper", hostUrl] as const;
	const settingsQuery = useQuery({
		queryKey,
		enabled: enabled && hostUrl !== null,
		retry: false,
		queryFn: () => {
			if (!hostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.superwhisper.get.query();
		},
	});
	const setMutation = useMutation({
		mutationFn: (input: { hostUrl: string | null; enabled: boolean }) => {
			if (!input.hostUrl) throw new Error("Host service unavailable");
			return getHostServiceClientByUrl(
				input.hostUrl,
			).settings.superwhisper.set.mutate({
				enabled: input.enabled,
			});
		},
		onSuccess: (settings, input) => {
			queryClient.setQueryData(["host-superwhisper", input.hostUrl], settings);
		},
		onError: (error) => {
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to update Superwhisper settings",
					}),
				),
			);
		},
	});

	if (
		!enabled ||
		settingsQuery.isPending ||
		settingsQuery.isError ||
		isSuperwhisperProcedureUnavailable(settingsQuery.error) ||
		!settingsQuery.data
	)
		return null;

	const settings = settingsQuery.data;
	const controlsDisabled = setMutation.isPending;

	return (
		<div className="mt-4">
			<SettingsRow
				label={t({
					message: "Use Superwhisper for mobile dictation",
				})}
				htmlFor="superwhisper-enabled"
			>
				<Switch
					id="superwhisper-enabled"
					checked={settings.enabled}
					disabled={controlsDisabled}
					onCheckedChange={(nextEnabled) =>
						setMutation.mutate({ hostUrl, enabled: nextEnabled })
					}
				/>
			</SettingsRow>
			<SettingsRow
				label={t({
					message: "Superwhisper status",
				})}
			>
				<div className="flex flex-wrap justify-end gap-2">
					<Badge variant={settings.installed ? "secondary" : "outline"}>
						{settings.installed ? (
							<Trans>Installed</Trans>
						) : (
							<Trans>Not installed</Trans>
						)}
					</Badge>
					<Badge variant={settings.modeReady ? "secondary" : "outline"}>
						{settings.modeReady ? (
							<Trans>Superset mode ready</Trans>
						) : (
							<Trans>Superset mode needs setup</Trans>
						)}
					</Badge>
				</div>
			</SettingsRow>
			<SettingsRow label={t({ message: "Model and language" })}>
				<span className="text-sm text-muted-foreground">
					<Trans>Superset mode in Superwhisper</Trans>
				</span>
			</SettingsRow>
		</div>
	);
}
