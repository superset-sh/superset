import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface CloneInput {
	url: string;
	parentDir: string;
}

interface EmptyProjectInput {
	name: string;
	parentDir: string;
	onError?: (message: string) => void;
}

type CreateProjectMutationResult =
	| { success: true; project: { id: string } }
	| { success: false; error?: string };

export function useCreateV1Project() {
	const cloneRepo = electronTrpc.projects.cloneRepo.useMutation();
	const createEmptyRepo = electronTrpc.projects.createEmptyRepo.useMutation();
	const utils = electronTrpc.useUtils();

	const runCreate = useCallback(
		async (
			create: () => Promise<CreateProjectMutationResult>,
			onError?: (message: string) => void,
		): Promise<string | null> => {
			const reportError = (message: string) => {
				if (onError) {
					onError(message);
					return;
				}
				toast.error("Could not create project", { description: message });
			};

			try {
				const result = await create();
				if (!result.success) {
					reportError(result.error ?? "An unknown error occurred");
					return null;
				}
				await utils.projects.getRecents.invalidate();
				return result.project.id;
			} catch (err) {
				reportError(err instanceof Error ? err.message : String(err));
				return null;
			}
		},
		[utils],
	);

	const cloneFromUrl = useCallback(
		({ url, parentDir }: CloneInput): Promise<string | null> =>
			runCreate(() =>
				cloneRepo.mutateAsync({
					url,
					targetDirectory: parentDir,
				}),
			),
		[cloneRepo, runCreate],
	);

	const createFromTemplate = useCallback(
		({ repoUrl, parentDir }: { repoUrl: string; parentDir: string }) =>
			cloneFromUrl({ url: repoUrl, parentDir }),
		[cloneFromUrl],
	);

	const createEmpty = useCallback(
		({ name, parentDir, onError }: EmptyProjectInput): Promise<string | null> =>
			runCreate(
				() => createEmptyRepo.mutateAsync({ name, parentDir }),
				onError,
			),
		[createEmptyRepo, runCreate],
	);

	return {
		cloneFromUrl,
		createEmpty,
		createFromTemplate,
		isPending: cloneRepo.isPending || createEmptyRepo.isPending,
	};
}
