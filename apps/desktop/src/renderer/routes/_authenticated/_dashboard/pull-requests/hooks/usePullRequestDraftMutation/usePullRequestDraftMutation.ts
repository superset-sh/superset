import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import {
	type PullRequestTarget,
	setPullRequestDraft,
} from "../../utils/pullRequestClient";
import { useInvalidatePullRequestDetail } from "../usePullRequestDetail";

export type PullRequestActionTarget = PullRequestTarget;

/** Flips a pull request between draft and ready for review, as the viewer. */
export function usePullRequestDraftMutation(target: PullRequestTarget) {
	const { t } = useLingui();
	const invalidate = useInvalidatePullRequestDetail(target);
	return useMutation({
		mutationFn: (draft: boolean) => setPullRequestDraft(target, draft),
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
