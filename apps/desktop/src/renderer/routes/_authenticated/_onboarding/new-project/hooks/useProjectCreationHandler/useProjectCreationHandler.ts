import { useNavigate } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function useProjectCreationHandler(onError: (error: string) => void) {
	const utils = electronTrpc.useUtils();
	const navigate = useNavigate();

	const handleResult = (
		result: {
			canceled?: boolean;
			success?: boolean;
			error?: string | null;
			project?: { id: string } | null;
		},
		resetState?: () => void,
	) => {
		if (result.canceled) return;
		if (result.success && result.project) {
			utils.projects.getRecents.invalidate();
			resetState?.();
			navigate({
				to: "/project/$projectId",
				params: { projectId: result.project.id },
				replace: true,
			});
		} else if (!result.success && result.error) {
			onError(result.error);
		}
	};

	const handleError = (err: { message?: string }) => {
		onError(err.message || "Operation failed");
	};

	return {
		handleResult,
		handleError,
	};
}
