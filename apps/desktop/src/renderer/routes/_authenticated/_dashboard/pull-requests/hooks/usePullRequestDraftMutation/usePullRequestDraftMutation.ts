import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useInvalidatePullRequestDetail } from "../usePullRequestDetail";

export interface PullRequestActionTarget {
	projectId: string;
	hostUrl: string;
	prNumber: number;
}

/** Flips a pull request between draft and ready for review through the host. */
export function usePullRequestDraftMutation(target: PullRequestActionTarget) {
	const { t } = useLingui();
	const invalidate = useInvalidatePullRequestDetail(target);
	return useMutation({
		mutationFn: (draft: boolean) =>
			getHostServiceClientByUrl(target.hostUrl).pullRequests.setDraft.mutate({
				projectId: target.projectId,
				prNumber: target.prNumber,
				draft,
			}),
		onSuccess: invalidate,
		onError: (error, draft) => {
			toast.error(
				draft
					? t({ message: "Couldn't convert to draft" })
					: t({ message: "Couldn't mark ready for review" }),
				{ description: errorMessage(error) },
			);
		},
	});
}
