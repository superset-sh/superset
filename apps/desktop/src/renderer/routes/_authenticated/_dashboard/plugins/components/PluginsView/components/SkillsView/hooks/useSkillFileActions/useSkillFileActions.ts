import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { electronTrpcClient } from "renderer/lib/trpc-client";

export function useSkillFileActions() {
	const { t } = useLingui();

	const openInEditor = async (path: string) => {
		try {
			await electronTrpcClient.external.openFileInEditor.mutate({ path });
		} catch (error) {
			toast.error(
				t({
					message: `Failed to open file: ${errorMessage(
						error,
						t({ message: "Unknown error" }),
					)}`,
				}),
			);
		}
	};

	const revealInFinder = async (path: string) => {
		try {
			await electronTrpcClient.external.openInFinder.mutate(path);
		} catch (error) {
			toast.error(
				t({
					message: `Failed to reveal in Finder: ${errorMessage(
						error,
						t({ message: "Unknown error" }),
					)}`,
				}),
			);
		}
	};

	return { openInEditor, revealInFinder };
}
