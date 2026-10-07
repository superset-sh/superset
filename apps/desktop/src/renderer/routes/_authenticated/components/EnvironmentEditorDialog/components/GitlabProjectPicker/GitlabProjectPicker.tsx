import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";

export interface GitlabProjectChoice {
	cloneUrl: string;
	pathWithNamespace: string;
}

interface GitlabProjectPickerProps {
	organizationId: string;
	value: GitlabProjectChoice | null;
	onChange: (project: GitlabProjectChoice) => void;
	/** Shows the project without listing; a promoted environment cannot change it. */
	disabled?: boolean;
}

export function GitlabProjectPicker({
	organizationId,
	value,
	onChange,
	disabled = false,
}: GitlabProjectPickerProps) {
	const { t } = useLingui();
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebouncedValue(search, 250);
	const projects = useInfiniteQuery({
		queryKey: [
			"cloudWorkspace",
			"listGitlabProjects",
			organizationId,
			debouncedSearch,
		],
		queryFn: ({ pageParam }) =>
			cloudTrpcClient.cloudWorkspace.listGitlabProjects.query({
				organizationId,
				query: debouncedSearch || undefined,
				page: pageParam,
			}),
		initialPageParam: 1,
		getNextPageParam: (last) => last.nextPage ?? undefined,
		enabled: !disabled,
	});

	const owner = JSON.stringify([
		organizationId,
		search,
		debouncedSearch,
		disabled,
	]);
	const items =
		projects.isSuccess && search === debouncedSearch
			? projects.data.pages.flatMap((page) => page.items)
			: [];
	const current = useRef({
		owner,
		items,
		ready: false,
		error: false,
		hasNext: false,
		fetchingNext: false,
	});
	current.current = {
		owner,
		items,
		ready:
			!disabled &&
			search === debouncedSearch &&
			projects.isSuccess &&
			!projects.isRefetching,
		error: projects.isError,
		hasNext: projects.hasNextPage,
		fetchingNext: projects.isFetchingNextPage,
	};
	const live = useRef(true);
	useEffect(() => {
		live.current = true;
		return () => {
			live.current = false;
		};
	}, []);
	const select = (project: (typeof items)[number]) => {
		if (
			!live.current ||
			owner !== current.current.owner ||
			!current.current.ready ||
			!current.current.items.some(
				(row) =>
					row.connectionId === project.connectionId &&
					row.projectId === project.projectId &&
					row.cloneUrl === project.cloneUrl &&
					row.pathWithNamespace === project.pathWithNamespace &&
					row.defaultBranch === project.defaultBranch,
			)
		)
			return;
		onChange({
			cloneUrl: project.cloneUrl,
			pathWithNamespace: project.pathWithNamespace,
		});
	};

	if (disabled) {
		return (
			<div className="rounded-md border px-3 py-2 text-sm">
				{value?.pathWithNamespace}
			</div>
		);
	}

	return (
		<Command className="rounded-md border" shouldFilter={false}>
			<CommandInput
				onValueChange={setSearch}
				placeholder={t({ message: "Search GitLab projects..." })}
				value={search}
			/>
			<CommandList className="max-h-48">
				{projects.isPending || search !== debouncedSearch ? (
					<p className="px-3 py-2 text-sm text-muted-foreground">
						<Trans>Loading projects...</Trans>
					</p>
				) : projects.isError ? (
					<p className="px-3 py-2 text-sm text-muted-foreground">
						<Trans>
							Could not load GitLab projects. Check the connection in
							Integrations.
						</Trans>
					</p>
				) : items.length === 0 ? (
					<p className="px-3 py-2 text-sm text-muted-foreground">
						<Trans>
							No GitLab projects found. Connect GitLab in Integrations.
						</Trans>
					</p>
				) : (
					<CommandGroup>
						{items.map((project) => (
							<CommandItem
								disabled={!current.current.ready}
								key={project.cloneUrl}
								onSelect={() => select(project)}
								value={project.cloneUrl}
							>
								{project.pathWithNamespace}
							</CommandItem>
						))}
					</CommandGroup>
				)}
			</CommandList>
			{projects.isError ? (
				<Button
					onClick={() => {
						if (
							live.current &&
							owner === current.current.owner &&
							current.current.error
						)
							void projects.refetch();
					}}
					variant="ghost"
				>
					<Trans>Try again</Trans>
				</Button>
			) : projects.hasNextPage ? (
				<Button
					disabled={!current.current.ready || projects.isFetchingNextPage}
					onClick={() => {
						if (
							live.current &&
							owner === current.current.owner &&
							current.current.ready &&
							current.current.hasNext &&
							!current.current.fetchingNext
						)
							void projects.fetchNextPage();
					}}
					variant="ghost"
				>
					<Trans>Load more</Trans>
				</Button>
			) : null}
			{value ? (
				<div className="border-t px-3 py-2 text-sm text-muted-foreground">
					{value.pathWithNamespace}
				</div>
			) : null}
		</Command>
	);
}
