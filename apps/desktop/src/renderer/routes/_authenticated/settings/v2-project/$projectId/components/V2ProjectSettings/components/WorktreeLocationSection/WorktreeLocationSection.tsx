import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	useV2WorktreeLocationSettings,
	V2WorktreeLocationPicker,
} from "../../../../../../components/V2WorktreeLocationPicker";

interface WorktreeLocationSectionProps {
	projectId: string;
	currentPath: string | null;
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	isHostOnline: boolean;
	isProjectSetup: boolean;
	onChanged?: () => void;
}

export function WorktreeLocationSection({
	projectId,
	currentPath,
	hostUrl,
	hostName,
	isRemoteTarget,
	isHostOnline,
	isProjectSetup,
	onChanged,
}: WorktreeLocationSectionProps) {
	const { t } = useLingui();
	const hostSettingsQuery = useV2WorktreeLocationSettings(hostUrl, {
		enabled: isHostOnline,
	});

	const setLocation = useMutation({
		mutationFn: async (path: string | null) => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).project.setWorktreeBaseDir.mutate({ projectId, path });
		},
		onSuccess: (_data, path) => {
			toast.success(
				path
					? t({
							message: "Project worktree location updated",
						})
					: t({
							message: "Project worktree location reset",
						}),
			);
			onChanged?.();
		},
		onError: (err) => {
			toast.error(errorMessage(err));
		},
	});

	return (
		<V2WorktreeLocationPicker
			currentPath={currentPath}
			fallbackPath={
				hostSettingsQuery.data?.worktreeBaseDir ??
				hostSettingsQuery.data?.defaultWorktreeBaseDir ??
				null
			}
			hostUrl={hostUrl}
			hostName={hostName}
			isRemoteTarget={isRemoteTarget}
			disabled={
				!hostUrl ||
				!isHostOnline ||
				!isProjectSetup ||
				hostSettingsQuery.isLoading ||
				setLocation.isPending
			}
			browseTitle={t({
				message: "Select project worktree location",
			})}
			browseDescription={t({
				message: `Pick the project worktree folder on ${hostName}.`,
			})}
			onSelect={(path) => setLocation.mutate(path)}
			onReset={() => setLocation.mutate(null)}
		/>
	);
}
