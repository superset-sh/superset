import type { ElectronRouterOutputs } from "renderer/lib/electron-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";

export type SkillsListing = ElectronRouterOutputs["skills"]["list"];
export type SkillListItem = SkillsListing["skills"][number];
export type SkillScope = SkillListItem["scope"];
export type SkillRef = SkillListItem["ref"];

interface UseSkillsOptions {
	projectId: string | null;
	/** Hold off until the project list loads, so the first fetch carries the project. */
	enabled?: boolean;
}

export function useSkills({ projectId, enabled = true }: UseSkillsOptions) {
	const query = electronTrpc.skills.list.useQuery(
		{ projectId: projectId ?? undefined },
		{ enabled, refetchOnWindowFocus: true },
	);
	return {
		skills: query.data?.skills ?? [],
		project: query.data?.project ?? null,
		personalRoot: query.data?.personalRoot ?? null,
		isLoading: query.isLoading,
		isRefetching: query.isRefetching,
		error: query.error,
		refetch: query.refetch,
	};
}
