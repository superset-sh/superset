import type { ShareGranteeRef } from "@superset/shared/sharing";
import type { PageVisibility } from "@superset/shared/usercontent";
import type { RouterOutputs } from "@superset/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiClient } from "@/lib/trpc/client";

export type { PageVisibility } from "@superset/shared/usercontent";
export type PageVersion = RouterOutputs["page"]["versions"][number];

export function usePageAccessQuery(slug: string | undefined) {
	return useQuery({
		queryKey: ["cloud", "page", "access", slug],
		enabled: Boolean(slug),
		queryFn: () => apiClient.page.access.query({ slug: slug as string }),
	});
}

export function usePageVersionsQuery(slug: string | undefined) {
	return useQuery({
		queryKey: ["cloud", "page", "versions", slug],
		enabled: Boolean(slug),
		queryFn: () => apiClient.page.versions.query({ slug: slug as string }),
	});
}

export function usePageSharingActions(pageId: string | undefined) {
	const queryClient = useQueryClient();
	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: ["cloud", "page", "pull"],
		});
		void queryClient.invalidateQueries({ queryKey: ["cloud", "page", "list"] });
	}, [queryClient]);

	const setVisibility = useMutation({
		mutationFn: (visibility: PageVisibility) =>
			apiClient.page.setVisibility.mutate({
				id: pageId as string,
				visibility,
			}),
		onSuccess: invalidate,
	});

	const setSharedVersion = useMutation({
		mutationFn: (version: number | null) =>
			apiClient.page.setSharedVersion.mutate({ id: pageId as string, version }),
		onSuccess: invalidate,
	});

	return { setVisibility, setSharedVersion };
}

export type PageShareRole = "view" | "comment";

const sharingKey = (pageId: string | undefined) => [
	"cloud",
	"page",
	"sharing",
	pageId,
];

export function usePageGranteesQuery(pageId: string | undefined) {
	return useQuery({
		queryKey: sharingKey(pageId),
		enabled: Boolean(pageId),
		queryFn: () => apiClient.page.sharing.get.query({ id: pageId as string }),
	});
}

export function usePageShareMutations(pageId: string | undefined) {
	const queryClient = useQueryClient();
	const refresh = useCallback(async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: sharingKey(pageId) }),
			queryClient.invalidateQueries({ queryKey: ["cloud", "page", "access"] }),
		]);
	}, [queryClient, pageId]);

	const add = useMutation({
		mutationFn: (input: { grantees: ShareGranteeRef[]; role: PageShareRole }) =>
			apiClient.page.sharing.add.mutate({ id: pageId as string, ...input }),
		onSuccess: refresh,
	});
	const remove = useMutation({
		mutationFn: (grantee: ShareGranteeRef) =>
			apiClient.page.sharing.remove.mutate({ id: pageId as string, grantee }),
		onSuccess: refresh,
	});
	const setRole = useMutation({
		mutationFn: (input: { grantee: ShareGranteeRef; role: PageShareRole }) =>
			apiClient.page.sharing.setRole.mutate({ id: pageId as string, ...input }),
		onSuccess: refresh,
	});
	const setOrgRole = useMutation({
		mutationFn: (role: PageShareRole) =>
			apiClient.page.setOrgRole.mutate({ id: pageId as string, role }),
		onSuccess: refresh,
	});

	return { add, remove, setRole, setOrgRole };
}
