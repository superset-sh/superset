import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { isMissingProcedureError } from "renderer/lib/isMissingProcedureError";

interface RepositoryChoice {
	cloneUrl: string;
	fullName: string;
}

interface GitLabRepositoryPickerProps {
	disabled: boolean;
	hostUrl: string | null;
	onSelect: (repository: RepositoryChoice) => void;
	onInvalidate: () => void;
	selectedCloneUrl: string | null;
}

function gitlabAuthority(value: string): string | null {
	const raw = value.trim();
	if (!/^(?:https:\/\/)?[^\s/%\\@?#]+\/?$/.test(raw)) return null;
	try {
		const url = new URL(raw.startsWith("https://") ? raw : `https://${raw}`);
		return url.protocol === "https:" &&
			url.hostname &&
			url.hostname !== "github.com" &&
			url.pathname === "/" &&
			!url.username &&
			!url.password
			? url.host
			: null;
	} catch {
		return null;
	}
}

export function GitLabRepositoryPicker({
	disabled,
	hostUrl,
	onSelect,
	onInvalidate,
	selectedCloneUrl,
}: GitLabRepositoryPickerProps) {
	const { t } = useLingui();
	const [host, setHost] = useState("gitlab.com");
	const [search, setSearch] = useState("");
	const authority = gitlabAuthority(host);
	const query = useInfiniteQuery({
		queryKey: ["gitlab-repositories", hostUrl, authority, search.trim()],
		queryFn: ({ pageParam, signal }) => {
			if (!hostUrl || !authority)
				throw new Error("No selected GitLab authority");
			return getHostServiceClientByUrl(
				hostUrl,
			).project.listGitLabRepositoriesForHost.query(
				{
					host: authority,
					page: pageParam,
					search: search.trim() || undefined,
				},
				{ signal },
			);
		},
		initialPageParam: 1,
		getNextPageParam: (page) => page.nextPage ?? undefined,
		enabled: !disabled && hostUrl !== null && authority !== null,
		retry: false,
		gcTime: 0,
		staleTime: 60_000,
	});
	const items = query.isSuccess
		? Array.from(
				new Map(
					query.data.pages
						.flatMap((page) => page.repositories)
						.map((item) => [item.cloneUrl, item]),
				).values(),
			)
		: [];
	const scope = JSON.stringify([hostUrl, host, search, disabled]);
	const current = useRef({
		scope,
		epoch: 0,
		items,
		ready: false,
		fetching: false,
		hasNext: false,
	});
	const epoch =
		current.current.scope === scope
			? current.current.epoch
			: current.current.epoch + 1;
	current.current = {
		scope,
		epoch,
		items,
		ready:
			!disabled &&
			hostUrl !== null &&
			authority !== null &&
			query.isSuccess &&
			!query.isFetching &&
			!query.isError,
		fetching: query.isFetching,
		hasNext: query.hasNextPage,
	};
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const live = () =>
		mounted.current &&
		current.current.scope === scope &&
		current.current.epoch === epoch &&
		!disabled &&
		hostUrl !== null &&
		authority !== null;
	const select = (repository: RepositoryChoice) => {
		if (
			!live() ||
			!current.current.ready ||
			!current.current.items.some(
				(item) =>
					item.cloneUrl === repository.cloneUrl &&
					item.fullName === repository.fullName,
			)
		)
			return;
		onSelect(repository);
	};

	return (
		<div className="flex flex-col gap-2">
			<span className="text-xs font-medium">
				<Trans>GitLab repositories</Trans>
			</span>
			<Label htmlFor="gitlab-repository-host" className="text-xs">
				<Trans>GitLab host</Trans>
			</Label>
			<Input
				id="gitlab-repository-host"
				aria-label={t({ message: "GitLab host" })}
				disabled={disabled}
				value={host}
				maxLength={1024}
				onChange={(event) => {
					onInvalidate();
					setHost(event.currentTarget.value);
				}}
			/>
			<Input
				aria-label={t({ message: "Search GitLab repositories..." })}
				placeholder={t({ message: "Search GitLab repositories..." })}
				value={search}
				maxLength={256}
				disabled={disabled || !hostUrl || !authority}
				onChange={(event) => {
					onInvalidate();
					setSearch(event.currentTarget.value);
				}}
			/>
			{!hostUrl ? (
				<p className="text-xs text-muted-foreground">
					<Trans>Select a host to browse repositories.</Trans>
				</p>
			) : !authority ? (
				<p role="alert" className="text-xs text-destructive">
					<Trans>
						Enter a GitLab HTTPS host, such as gitlab.com or
						gitlab.example.com:8443.
					</Trans>
				</p>
			) : null}
			{query.isFetching && (
				<p className="text-xs text-muted-foreground">
					<Trans>Loading repositories...</Trans>
				</p>
			)}
			{query.isError && (
				<div className="flex flex-col gap-1">
					<p role="alert" className="text-xs text-destructive">
						{isMissingProcedureError(query.error) ? (
							<Trans>
								Update this host to browse GitLab repositories. You can still
								clone a repository URL or path.
							</Trans>
						) : (
							errorMessage(query.error)
						)}
					</p>
					<Button
						variant="outline"
						size="sm"
						disabled={disabled || query.isFetching}
						onClick={() => {
							if (!live() || current.current.fetching) return;
							if (query.isFetchNextPageError) void query.fetchNextPage();
							else void query.refetch();
						}}
					>
						<Trans>Retry</Trans>
					</Button>
				</div>
			)}
			{query.isSuccess && !query.isFetching && items.length === 0 && (
				<p className="text-xs text-muted-foreground">
					<Trans>No matches</Trans>
				</p>
			)}
			<div className="max-h-48 overflow-y-auto">
				{items.map((repository) => (
					<Button
						key={repository.cloneUrl}
						data-gitlab-repository={repository.cloneUrl}
						variant={
							selectedCloneUrl === repository.cloneUrl ? "secondary" : "ghost"
						}
						className="w-full justify-start truncate text-xs"
						disabled={!current.current.ready}
						onClick={() => select(repository)}
					>
						{repository.fullName}
					</Button>
				))}
			</div>
			{query.hasNextPage && (
				<Button
					variant="outline"
					size="sm"
					disabled={!current.current.ready}
					onClick={() => {
						if (
							live() &&
							current.current.ready &&
							current.current.hasNext &&
							!current.current.fetching
						)
							void query.fetchNextPage();
					}}
				>
					<Trans>Load more</Trans>
				</Button>
			)}
		</div>
	);
}
