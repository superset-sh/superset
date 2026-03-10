import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { transformPrUrl } from "renderer/utils/pr-url";
import { DEFAULT_PR_LINK_PROVIDER } from "shared/constants";

interface UseCreateOrOpenPROptions {
	worktreePath?: string;
	onSuccess?: () => void;
}

interface UseCreateOrOpenPRResult {
	createOrOpenPR: () => void;
	isPending: boolean;
}

export function useCreateOrOpenPR({
	worktreePath,
	onSuccess,
}: UseCreateOrOpenPROptions): UseCreateOrOpenPRResult {
	const { mutateAsync, isPending } =
		electronTrpc.changes.createPR.useMutation();
	const { data: prLinkSettings } =
		electronTrpc.settings.getPrLinkProvider.useQuery();
	const provider = prLinkSettings?.provider ?? DEFAULT_PR_LINK_PROVIDER;
	const customDomain = prLinkSettings?.customDomain;

	const createOrOpenPR = useCallback(() => {
		if (!worktreePath || isPending) return;

		void (async () => {
			try {
				const result = await mutateAsync({ worktreePath });
				const url = transformPrUrl(result.url, provider, customDomain);
				window.open(url, "_blank", "noopener,noreferrer");
				toast.success("Opening pull request...");
				onSuccess?.();
				return;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const isBehindUpstreamError = message.includes("behind upstream");
				if (!isBehindUpstreamError) {
					toast.error(`Failed: ${message}`);
					return;
				}

				const shouldContinue = window.confirm(
					`${message}\n\nCreate/open the pull request anyway?`,
				);
				if (!shouldContinue) {
					return;
				}
			}

			try {
				const result = await mutateAsync({
					worktreePath,
					allowOutOfDate: true,
				});
				const url = transformPrUrl(result.url, provider, customDomain);
				window.open(url, "_blank", "noopener,noreferrer");
				toast.success("Opening pull request...");
				onSuccess?.();
			} catch (retryError) {
				const retryMessage =
					retryError instanceof Error ? retryError.message : String(retryError);
				toast.error(`Failed: ${retryMessage}`);
			}
		})();
	}, [isPending, mutateAsync, onSuccess, worktreePath, provider, customDomain]);

	return {
		createOrOpenPR,
		isPending,
	};
}
