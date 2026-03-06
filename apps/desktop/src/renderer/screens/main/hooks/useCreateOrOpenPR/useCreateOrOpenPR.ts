import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

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

	const createOrOpenPR = useCallback(() => {
		if (!worktreePath || isPending) return;

		void (async () => {
			try {
				const result = await mutateAsync({ worktreePath });
				window.open(result.url, "_blank", "noopener,noreferrer");
				toast.success("Opening GitHub...");
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
				window.open(result.url, "_blank", "noopener,noreferrer");
				toast.success("Opening GitHub...");
				onSuccess?.();
			} catch (retryError) {
				const retryMessage =
					retryError instanceof Error ? retryError.message : String(retryError);
				toast.error(`Failed: ${retryMessage}`);
			}
		})();
	}, [isPending, mutateAsync, onSuccess, worktreePath]);

	return {
		createOrOpenPR,
		isPending,
	};
}
