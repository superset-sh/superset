import { trpc } from "renderer/lib/trpc";

export function useReorderProjects() {
	const utils = trpc.useUtils();

	return trpc.projects.reorder.useMutation({
		onSuccess: () => {
			utils.projects.getAllWithWorkspaces.invalidate();
		},
	});
}
