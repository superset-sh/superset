import { Trans, useLingui } from "@lingui/react/macro";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { StatusIcon } from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import {
	type LinearIssue,
	statusIconType,
} from "renderer/routes/_authenticated/_dashboard/tasks/utils/linearIssueTypes";

const SEARCH_DEBOUNCE_MS = 300;

interface LinearIssueLinkCommandProps {
	children: ReactNode;
	tooltipLabel: string;
	onSelect: (issue: LinearIssue) => void;
}

export function LinearIssueLinkCommand({
	children,
	tooltipLabel,
	onSelect,
}: LinearIssueLinkCommandProps) {
	const { t } = useLingui();
	const organizationId = useActiveOrganizationId();
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [showClosed, setShowClosed] = useState(false);
	const showClosedId = useId();
	const debouncedQuery = useDebouncedValue(
		searchQuery.trim(),
		SEARCH_DEBOUNCE_MS,
	);

	const connection = cloudTrpc.integration.linear.getConnection.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: open && !!organizationId },
	);
	const isConnected = !!connection.data && !connection.data.needsReconnect;
	const { data, isFetching, error } =
		cloudTrpc.integration.linear.issues.useQuery(
			{
				organizationId: organizationId ?? "",
				status: showClosed ? "all" : "active",
				assignee: debouncedQuery ? null : "me",
				search: debouncedQuery || null,
			},
			{
				enabled: open && isConnected,
				staleTime: 30_000,
				retry: false,
			},
		);
	const issues = data?.issues ?? [];

	const handleSelect = (issue: LinearIssue) => {
		onSelect(issue);
		setSearchQuery("");
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (!next) setSearchQuery("");
				setOpen(next);
			}}
		>
			<Tooltip>
				<PopoverTrigger asChild>
					<TooltipTrigger asChild>{children}</TooltipTrigger>
				</PopoverTrigger>
				<TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
			</Tooltip>
			<PopoverContent
				className="w-[440px] p-0"
				align="start"
				side="bottom"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={t({ message: "Search Linear…" })}
						value={searchQuery}
						onValueChange={setSearchQuery}
					/>
					<div className="flex items-center gap-2 border-b px-3 py-2">
						<Checkbox
							id={showClosedId}
							checked={showClosed}
							onCheckedChange={(checked) => setShowClosed(checked === true)}
						/>
						<label
							htmlFor={showClosedId}
							className="cursor-pointer select-none text-xs text-muted-foreground"
						>
							<Trans>Show closed</Trans>
						</label>
					</div>
					<CommandList className="max-h-[420px]">
						{!connection.isLoading && !isConnected ? (
							<div className="px-3 py-6 text-center text-sm text-muted-foreground">
								<Trans>
									Connect your Linear account in Settings → Integrations to link
									Linear issues.
								</Trans>
							</div>
						) : error ? (
							<div className="px-3 py-6 text-center text-sm text-destructive">
								{error.message}
							</div>
						) : issues.length === 0 ? (
							<CommandEmpty>
								{isFetching || searchQuery.trim() !== debouncedQuery ? (
									<Trans>Searching…</Trans>
								) : (
									<Trans>No issues found.</Trans>
								)}
							</CommandEmpty>
						) : (
							<CommandGroup
								heading={
									debouncedQuery
										? t({ message: "Results" })
										: t({ message: "Assigned to you" })
								}
							>
								{issues.map((issue) => (
									<CommandItem
										key={issue.id}
										value={issue.id}
										onSelect={() => handleSelect(issue)}
										className="group items-start gap-3 rounded-md px-2.5 py-2"
									>
										<span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
											<StatusIcon
												type={statusIconType(issue.state.type)}
												color={issue.state.color}
											/>
										</span>
										<div className="flex min-w-0 flex-1 flex-col gap-0.5">
											<span className="truncate text-sm leading-snug">
												{issue.title}
											</span>
											<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
												<span className="font-mono">{issue.identifier}</span>
												<span aria-hidden>·</span>
												<span>{issue.state.name}</span>
											</span>
										</div>
										<span className="ml-2 hidden shrink-0 self-center text-[11px] text-muted-foreground group-data-[selected=true]:inline">
											↵
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
