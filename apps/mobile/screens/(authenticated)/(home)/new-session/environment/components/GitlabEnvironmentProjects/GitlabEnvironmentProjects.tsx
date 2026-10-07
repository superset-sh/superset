import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { getCloudEnvironmentsQueryKey } from "@/hooks/useCloudEnvironments/useCloudEnvironments";
import { useSession } from "@/lib/auth/client";
import { errorCopy } from "@/lib/errors";
import { apiClient } from "@/lib/trpc/client";
import { useNewSessionPreferencesStore } from "@/screens/(authenticated)/(home)/home/components/NewChatWidget/stores/newSessionPreferencesStore";
import { cloudGitlabSelectionError } from "@/screens/(authenticated)/(home)/hooks/useCloudCreateSelection/useCloudCreateSelection";

type Project =
	RouterOutputs["cloudWorkspace"]["listGitlabProjects"]["items"][number];
export function GitlabEnvironmentProjects({
	onSelect,
}: {
	onSelect: (environmentId: string) => void;
}) {
	const { t } = useLingui();
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const environmentId = useNewSessionPreferencesStore(
		(state) => state.environmentId,
	);
	const [search, setSearch] = useState("");
	const query = search.trim();
	const scope = organizationId
		? JSON.stringify([organizationId, environmentId, query])
		: null;
	const latest = useRef(scope);
	latest.current = scope;
	const live = useRef(true);
	const inFlight = useRef(false);
	useEffect(() => {
		live.current = true;
		latest.current = scope;
		return () => {
			live.current = false;
			latest.current = null;
		};
	}, [scope]);
	const queryClient = useQueryClient();
	const projects = useInfiniteQuery({
		queryKey: ["cloud", "gitlab-projects", organizationId, query],
		enabled: organizationId !== null,
		initialPageParam: 1,
		queryFn: ({ pageParam }) => {
			if (!organizationId) throw Error("No active organization");
			return apiClient.cloudWorkspace.listGitlabProjects.query({
				organizationId,
				query: query || undefined,
				page: pageParam,
			});
		},
		getNextPageParam: (last) => last.nextPage ?? undefined,
	});
	const currentProjects = useRef<Project[]>([]);
	currentProjects.current =
		!projects.isError && projects.data
			? projects.data.pages.flatMap((page) => page.items)
			: [];
	const ownsProject = (project: Project) =>
		currentProjects.current.some(
			(row) =>
				row.connectionId === project.connectionId &&
				row.projectId === project.projectId &&
				row.cloneUrl === project.cloneUrl &&
				row.pathWithNamespace === project.pathWithNamespace &&
				row.defaultBranch === project.defaultBranch,
		);
	const create = useMutation({
		mutationFn: async ({
			project,
			key,
			org,
		}: {
			project: Project;
			key: string;
			org: string;
		}) => {
			if (!live.current || key !== latest.current || !ownsProject(project))
				throw cloudGitlabSelectionError();
			const row = await apiClient.environment.create.mutate({
				organizationId: org,
				name: project.pathWithNamespace.slice(0, 100),
				gitlabCloneUrl: project.cloneUrl,
			});
			if (!live.current || key !== latest.current || !ownsProject(project))
				throw cloudGitlabSelectionError();
			return row;
		},
		onSuccess: async (row, variables) => {
			if (
				!live.current ||
				variables.key !== latest.current ||
				!ownsProject(variables.project)
			)
				return;
			await queryClient.invalidateQueries({
				queryKey: getCloudEnvironmentsQueryKey(variables.org),
			});
			if (
				live.current &&
				variables.key === latest.current &&
				ownsProject(variables.project)
			)
				onSelect(row.id);
		},
		onError: (error, variables) => {
			if (
				live.current &&
				variables.key === latest.current &&
				ownsProject(variables.project)
			)
				Alert.alert(
					t({ message: "Could not create environment" }),
					errorCopy(error),
				);
		},
		onSettled: () => {
			inFlight.current = false;
		},
	});
	const select = (project: Project) => {
		if (
			!live.current ||
			!organizationId ||
			!scope ||
			scope !== latest.current ||
			projects.isError ||
			inFlight.current ||
			!ownsProject(project)
		)
			return;
		inFlight.current = true;
		create.mutate({
			project: Object.freeze({ ...project }),
			key: scope,
			org: organizationId,
		});
	};
	return (
		<View className="gap-3 py-4">
			<Text className="font-semibold">
				<Trans>GitLab projects</Trans>
			</Text>
			<Text className="text-sm text-muted-foreground">
				<Trans>Select a project to create an environment for it.</Trans>
			</Text>
			<Input
				value={search}
				onChangeText={setSearch}
				maxLength={200}
				autoCapitalize="none"
				autoCorrect={false}
				placeholder={t({ message: "Search GitLab projects..." })}
			/>
			{(projects.isPending && organizationId) || create.isPending ? (
				<Spinner />
			) : null}
			{projects.isError ? (
				<Button
					variant="secondary"
					accessibilityLabel={t({ message: "Try again" })}
					onPress={() => {
						if (live.current && scope === latest.current)
							void projects.refetch();
					}}
				>
					<Text>
						<Trans>Could not load GitLab projects. Try again.</Trans>
					</Text>
				</Button>
			) : null}
			{!projects.isPending &&
			!projects.isError &&
			projects.data?.pages.every((page) => page.items.length === 0) ? (
				<Text>
					<Trans>
						No GitLab projects found. Connect GitLab in Integrations.
					</Trans>
				</Text>
			) : null}
			{!projects.isError
				? projects.data?.pages
						.flatMap((page) => page.items)
						.map((project) => (
							<Pressable
								key={project.cloneUrl}
								disabled={create.isPending}
								ph-label="gitlab-environment-project"
								onPress={() => select(project)}
								className="py-2"
							>
								<Text>{project.pathWithNamespace}</Text>
							</Pressable>
						))
				: null}
			{projects.hasNextPage && !projects.isError ? (
				<Button
					variant="secondary"
					accessibilityLabel={t({ message: "Load more" })}
					disabled={projects.isFetchingNextPage}
					onPress={() => {
						if (live.current && scope === latest.current)
							void projects.fetchNextPage();
					}}
				>
					<Text>
						<Trans>Load more</Trans>
					</Text>
				</Button>
			) : null}
		</View>
	);
}
