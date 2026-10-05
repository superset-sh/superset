import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export function useRestoreProject() {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	return useCallback(
		async ({
			projectId,
			projectName,
			hostUrls,
		}: {
			projectId: string;
			projectName: string;
			hostUrls: string[];
		}): Promise<boolean> => {
			const results = await Promise.allSettled(
				hostUrls.map((url) =>
					getHostServiceClientByUrl(url).project.restore.mutate({ projectId }),
				),
			);
			void queryClient.invalidateQueries({ queryKey: ["deleted-projects"] });
			const failed = results.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected",
			);
			if (failed) {
				toast.error(
					errorMessage(
						failed.reason,
						t({ message: `Couldn't restore "${projectName}"` }),
					),
				);
				return false;
			}
			toast.success(t({ message: `Restored "${projectName}"` }));
			return true;
		},
		[t, queryClient],
	);
}
