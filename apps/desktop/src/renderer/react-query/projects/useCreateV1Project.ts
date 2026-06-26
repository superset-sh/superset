import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface CloneInput {
	url: string;
	parentDir: string;
}

export function useCreateV1Project() {
	const cloneRepo = electronTrpc.projects.cloneRepo.useMutation();
	const utils = electronTrpc.useUtils();

	const cloneFromUrl = useCallback(
		async ({ url, parentDir }: CloneInput): Promise<string | null> => {
			try {
				const result = await cloneRepo.mutateAsync({
					url,
					targetDirectory: parentDir,
				});
				if (!result.success) {
					toast.error("Could not create project", {
						description: result.error,
					});
					return null;
				}
				await utils.projects.getRecents.invalidate();
				return result.project.id;
			} catch (err) {
				toast.error("Could not create project", {
					description: err instanceof Error ? err.message : String(err),
				});
				return null;
			}
		},
		[cloneRepo, utils],
	);

	const createFromTemplate = useCallback(
		({ repoUrl, parentDir }: { repoUrl: string; parentDir: string }) =>
			cloneFromUrl({ url: repoUrl, parentDir }),
		[cloneFromUrl],
	);

	return { cloneFromUrl, createFromTemplate, isPending: cloneRepo.isPending };
}
