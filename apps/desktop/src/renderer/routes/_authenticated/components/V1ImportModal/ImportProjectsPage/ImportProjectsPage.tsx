import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuFolder } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	getHostServiceClientByUrl,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import { getBaseName } from "renderer/lib/pathBasename";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import { ImportPageShell } from "../components/ImportPageShell";
import { ImportRow, type RowAction } from "../components/ImportRow";

interface ImportProjectsPageProps {
	organizationId: string;
	activeHostUrl: string;
}

const FIND_BY_PATH_KEY_PREFIX = ["v1-import", "findByPath"] as const;
const HOST_PROJECT_LIST_KEY_PREFIX = ["v1-import", "hostProjectList"] as const;

type V1Project = {
	id: string;
	name: string;
	mainRepoPath: string;
	githubOwner: string | null;
};

type ProjectFindByPathResult = Awaited<
	ReturnType<HostServiceClient["project"]["findByPath"]["query"]>
>;

export function ImportProjectsPage({
	organizationId,
	activeHostUrl,
}: ImportProjectsPageProps) {
	const queryClient = useQueryClient();
	const finalizeSetup = useFinalizeProjectSetup();
	const projectsQuery = electronTrpc.migration.readV1Projects.useQuery();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [importAllProgress, setImportAllProgress] = useState<{
		current: number;
		total: number;
	} | null>(null);

	const isLoading = projectsQuery.isPending;
	const isImportingAll = importAllProgress !== null;

	const projects = projectsQuery.data ?? [];

	const refresh = async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([
				projectsQuery.refetch(),
				queryClient.invalidateQueries({ queryKey: FIND_BY_PATH_KEY_PREFIX }),
			]);
		} finally {
			setIsRefreshing(false);
		}
	};

	const importAll = async () => {
		if (isImportingAll) return;
		const queue = projects;
		setImportAllProgress({ current: 0, total: queue.length });
		try {
			for (let i = 0; i < queue.length; i++) {
				const project = queue[i];
				if (!project) continue;
				setImportAllProgress({ current: i, total: queue.length });
				try {
					const findByPathResult = await fetchProjectFindByPath(
						queryClient,
						project,
						activeHostUrl,
					);
					if (isProjectAlreadyImported(findByPathResult)) {
						continue;
					}
					if (findByPathResult.candidates.length > 1) {
						continue;
					}
					if (
						findByPathResult.candidates.length === 0 &&
						findByPathResult.cloudErrors.length > 0
					) {
						continue;
					}
					const result = await importProject({
						project,
						activeHostUrl,
						findByPathResult,
						finalizeSetup,
					});
					if (result.kind === "imported") {
						await invalidateProjectImportQueries(queryClient, project);
					}
				} catch (err) {
					console.error("[v1-import] project import all failed", {
						v1ProjectId: project.id,
						mainRepoPath: project.mainRepoPath,
						organizationId,
						err,
					});
				}
			}
		} finally {
			setImportAllProgress(null);
		}
	};

	const headerAction =
		projects.length > 0 ? (
			<Button
				type="button"
				size="sm"
				variant="default"
				onClick={() => {
					void importAll();
				}}
				disabled={isImportingAll || isLoading}
				className="h-7 shrink-0 gap-1.5 px-2.5 text-[12px] font-medium tabular-nums"
			>
				{importAllProgress && <Spinner className="size-3" />}
				{importAllProgress
					? `Importing ${importAllProgress.current + 1}/${importAllProgress.total}`
					: "Import all"}
			</Button>
		) : null;

	return (
		<ImportPageShell
			title="Bring over your projects"
			description="Import each v1 project into v2. Already-imported projects show as Imported."
			isLoading={isLoading}
			itemCount={projects.length}
			emptyMessage="No v1 projects found on this device."
			onRefresh={refresh}
			isRefreshing={isRefreshing}
			headerAction={headerAction}
		>
			{projects.map((project) => (
				<ProjectRow
					key={project.id}
					project={project}
					organizationId={organizationId}
					activeHostUrl={activeHostUrl}
				/>
			))}
		</ImportPageShell>
	);
}

interface ProjectRowProps {
	project: V1Project;
	organizationId: string;
	activeHostUrl: string;
}

function isAlreadySetUpElsewhereError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return err.message.includes("Project is already set up on this device at");
}

function extractExistingPath(message: string): string | null {
	const match = message.match(
		/already set up on this device at (.+?)\.\s+Remove/,
	);
	return match?.[1] ?? null;
}

function expectedRemoteUrlFor(project: {
	name: string;
	mainRepoPath: string;
	githubOwner: string | null;
}): string | undefined {
	if (!project.githubOwner) return undefined;
	const repoName = getBaseName(project.mainRepoPath);
	if (!repoName) return undefined;
	return `https://github.com/${project.githubOwner}/${repoName}`;
}

function projectFindByPathQueryKey(project: V1Project, activeHostUrl: string) {
	return [
		...FIND_BY_PATH_KEY_PREFIX,
		project.mainRepoPath,
		expectedRemoteUrlFor(project) ?? "",
		activeHostUrl,
	] as const;
}

function projectFindByPathQueryFn(project: V1Project, activeHostUrl: string) {
	return async () => {
		const client = getHostServiceClientByUrl(activeHostUrl);
		return client.project.findByPath.query({
			repoPath: project.mainRepoPath,
			walkAllRemotes: true,
			expectedRemoteUrl: expectedRemoteUrlFor(project),
		});
	};
}

function fetchProjectFindByPath(
	queryClient: QueryClient,
	project: V1Project,
	activeHostUrl: string,
) {
	return queryClient.fetchQuery({
		queryKey: projectFindByPathQueryKey(project, activeHostUrl),
		queryFn: projectFindByPathQueryFn(project, activeHostUrl),
		retry: false,
	});
}

function isProjectAlreadyImported(
	findByPathResult: ProjectFindByPathResult | undefined,
) {
	return !!findByPathResult?.candidates.find((c) => c.source === "local-path");
}

type FinalizeProjectSetup = ReturnType<typeof useFinalizeProjectSetup>;

async function importProject({
	project,
	activeHostUrl,
	findByPathResult,
	finalizeSetup,
	linkToProjectId,
	allowRelocate = false,
}: {
	project: V1Project;
	activeHostUrl: string;
	findByPathResult: ProjectFindByPathResult | undefined;
	finalizeSetup: FinalizeProjectSetup;
	linkToProjectId?: string;
	allowRelocate?: boolean;
}): Promise<
	| { kind: "imported"; v2ProjectId: string }
	| { kind: "needs-relocate"; v2ProjectId: string; message: string }
> {
	const client = getHostServiceClientByUrl(activeHostUrl);
	const candidates = findByPathResult?.candidates ?? [];

	let v2ProjectId: string;
	let mainWorkspaceId: string | null = null;
	let repoPath = project.mainRepoPath;

	const targetCandidate = linkToProjectId
		? candidates.find((c) => c.id === linkToProjectId)
		: candidates[0];

	if (linkToProjectId && !targetCandidate) {
		throw new Error(
			"Selected v2 project is no longer in the candidate list. Refresh and pick again.",
		);
	}

	if (targetCandidate) {
		try {
			const result = await client.project.setup.mutate({
				projectId: targetCandidate.id,
				mode: {
					kind: "import",
					repoPath: project.mainRepoPath,
					allowRelocate,
				},
			});
			v2ProjectId = targetCandidate.id;
			mainWorkspaceId = result.mainWorkspaceId;
			repoPath = result.repoPath;
		} catch (err) {
			if (isAlreadySetUpElsewhereError(err) && !allowRelocate) {
				return {
					kind: "needs-relocate",
					v2ProjectId: targetCandidate.id,
					message: err instanceof Error ? err.message : String(err),
				};
			}
			throw err;
		}
	} else {
		const result = await client.project.create.mutate({
			name: project.name,
			mode: { kind: "importLocal", repoPath: project.mainRepoPath },
		});
		v2ProjectId = result.projectId;
		mainWorkspaceId = result.mainWorkspaceId;
		repoPath = result.repoPath;
	}

	finalizeSetup(activeHostUrl, {
		projectId: v2ProjectId,
		repoPath,
		mainWorkspaceId,
	});

	return { kind: "imported", v2ProjectId };
}

function invalidateProjectImportQueries(
	queryClient: QueryClient,
	project: V1Project,
) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: [...FIND_BY_PATH_KEY_PREFIX, project.mainRepoPath],
		}),
		queryClient.invalidateQueries({
			queryKey: HOST_PROJECT_LIST_KEY_PREFIX,
		}),
	]);
}

function ProjectRow({
	project,
	organizationId,
	activeHostUrl,
}: ProjectRowProps) {
	const queryClient = useQueryClient();
	const finalizeSetup = useFinalizeProjectSetup();
	const [running, setRunning] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [pendingRelocate, setPendingRelocate] = useState<{
		v2ProjectId: string;
		message: string;
	} | null>(null);
	const [linkedV2Id, setLinkedV2Id] = useState<string | null>(null);

	const findByPathQuery = useQuery({
		queryKey: projectFindByPathQueryKey(project, activeHostUrl),
		queryFn: projectFindByPathQueryFn(project, activeHostUrl),
		retry: false,
	});

	const isImported =
		isProjectAlreadyImported(findByPathQuery.data) || !!linkedV2Id;

	const runImport = async (
		linkToProjectId?: string,
		options: { allowRelocate?: boolean } = {},
	) => {
		setRunning(true);
		setErrorMessage(null);
		setPendingRelocate(null);
		try {
			const result = await importProject({
				project,
				activeHostUrl,
				findByPathResult: findByPathQuery.data,
				finalizeSetup,
				linkToProjectId,
				allowRelocate: options.allowRelocate ?? false,
			});

			if (result.kind === "needs-relocate") {
				setPendingRelocate({
					v2ProjectId: result.v2ProjectId,
					message: result.message,
				});
				setRunning(false);
				return;
			}

			setLinkedV2Id(result.v2ProjectId);
			await invalidateProjectImportQueries(queryClient, project);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setErrorMessage(message);
			console.error("[v1-import] project import failed", {
				v1ProjectId: project.id,
				mainRepoPath: project.mainRepoPath,
				organizationId,
				err,
			});
		} finally {
			setRunning(false);
		}
	};

	const action: RowAction = (() => {
		if (running) return { kind: "running" };
		if (pendingRelocate) {
			const existingPath = extractExistingPath(pendingRelocate.message);
			const message = existingPath
				? `Already set up at ${existingPath}. Link to ${project.mainRepoPath} instead?`
				: `Link to ${project.mainRepoPath}?`;
			return {
				kind: "confirm",
				message,
				confirmLabel: "Use this folder",
				cancelLabel: "Cancel",
				onConfirm: () => {
					void runImport(pendingRelocate.v2ProjectId, {
						allowRelocate: true,
					});
				},
				onCancel: () => setPendingRelocate(null),
			};
		}
		if (isImported) {
			return { kind: "imported", label: "Linked" };
		}
		if (errorMessage) {
			return {
				kind: "error",
				message: errorMessage,
				onRetry: () => runImport(),
			};
		}
		if (findByPathQuery.isPending) return { kind: "running" };
		if (findByPathQuery.isError) {
			const message =
				findByPathQuery.error instanceof Error
					? findByPathQuery.error.message
					: String(findByPathQuery.error);
			return {
				kind: "error",
				message,
				onRetry: () => {
					void findByPathQuery.refetch();
				},
			};
		}
		const candidates = findByPathQuery.data?.candidates ?? [];
		const cloudErrors = findByPathQuery.data?.cloudErrors ?? [];
		if (candidates.length === 0 && cloudErrors.length > 0) {
			const first = cloudErrors[0];
			return {
				kind: "error",
				message: first
					? `Couldn't reach cloud for ${first.url}: ${first.message}`
					: "Couldn't reach cloud",
				onRetry: () => {
					void findByPathQuery.refetch();
				},
			};
		}
		if (candidates.length > 1) {
			return {
				kind: "pick",
				label: "Link to…",
				candidates,
				onPick: (id) => {
					void runImport(id);
				},
			};
		}
		return {
			kind: "ready",
			label: candidates.length === 1 ? "Link" : "Import",
			onClick: () => {
				void runImport();
			},
		};
	})();

	return (
		<ImportRow
			icon={<LuFolder className="size-3.5" strokeWidth={2} />}
			primary={project.name}
			secondary={project.mainRepoPath}
			action={action}
		/>
	);
}
