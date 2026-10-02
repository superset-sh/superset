import { Trans, useLingui } from "@lingui/react/macro";
import type { TaskPriority } from "@superset/db/enums";
import { errorMessage } from "@superset/i18n/errors";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
	HiChevronDown,
	HiChevronRight,
	HiOutlineUserCircle,
	HiXMark,
} from "react-icons/hi2";
import { SiLinear } from "react-icons/si";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { PLATFORM } from "renderer/hotkeys";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useLinearWorkspace } from "../../../../../../hooks/useLinearWorkspace";
import { LinearAssigneeMenu } from "../../../../../LinearAssigneeMenu";
import { LinearPriorityMenu } from "../../../../../LinearPriorityMenu";
import { PriorityIcon } from "../../../shared/PriorityIcon";

interface CreateLinearIssueDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	defaultTeamId: string | null;
}

export function CreateLinearIssueDialog({
	open,
	onOpenChange,
	defaultTeamId,
}: CreateLinearIssueDialogProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const organizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const modKey = PLATFORM === "mac" ? "⌘" : "Ctrl";
	const titleInputRef = useRef<HTMLInputElement>(null);
	const { data: workspace } = useLinearWorkspace({ enabled: open });
	const [teamId, setTeamId] = useState<string | null>(defaultTeamId);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<TaskPriority>("none");
	const [assigneeId, setAssigneeId] = useState<string | null>(null);

	const teams = workspace?.teams ?? [];
	const selectedTeam =
		teams.find((team) => team.id === teamId) ?? teams[0] ?? null;
	const assignee = workspace?.users.find((user) => user.id === assigneeId);

	const createMutation = cloudTrpc.integration.linear.createIssue.useMutation({
		onSuccess: (issue) => {
			void utils.integration.linear.issues.invalidate();
			onOpenChange(false);
			toast.success(t({ message: `Created ${issue.identifier}` }));
			navigate({
				to: "/tasks/linear/$issueId",
				params: { issueId: issue.identifier },
			});
		},
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Failed to create Linear issue" })),
			),
	});

	useEffect(() => {
		if (open) return;
		setTeamId(defaultTeamId);
		setTitle("");
		setDescription("");
		setPriority("none");
		setAssigneeId(null);
	}, [defaultTeamId, open]);

	const handleCreate = () => {
		if (!title.trim() || !selectedTeam || !organizationId) return;
		if (createMutation.isPending) return;
		createMutation.mutate({
			organizationId,
			teamId: selectedTeam.id,
			title: title.trim(),
			description: description.trim() || undefined,
			priority,
			assigneeId: assigneeId ?? undefined,
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="!top-[calc(50%-min(35vh,320px))] !-translate-y-0 flex max-h-[min(72vh,640px)] flex-col gap-0 overflow-hidden bg-popover p-0 text-popover-foreground sm:max-w-[720px]"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					titleInputRef.current?.focus();
				}}
			>
				<DialogHeader className="sr-only">
					<DialogTitle>
						<Trans>Create Linear issue</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>Create a new issue in Linear.</Trans>
					</DialogDescription>
				</DialogHeader>

				<div className="flex items-center justify-between border-b px-4 py-2.5">
					<div className="flex min-w-0 items-center gap-2 text-sm">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex max-w-48 items-center gap-1.5 truncate rounded-md border border-border/60 bg-muted/40 px-2 py-1 font-medium text-muted-foreground hover:text-foreground"
								>
									<SiLinear className="size-3" />
									<span className="truncate">
										{selectedTeam?.name ?? t({ message: "Team" })}
									</span>
									<HiChevronDown className="size-3" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="max-h-72 w-56">
								{teams.map((team) => (
									<DropdownMenuItem
										key={team.id}
										onSelect={() => setTeamId(team.id)}
									>
										<span className="flex-1 truncate">{team.name}</span>
										<span className="font-mono text-[11px] text-muted-foreground">
											{team.key}
										</span>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<HiChevronRight className="size-3.5 text-muted-foreground" />
						<span className="font-medium">
							<Trans>New issue</Trans>
						</span>
					</div>
					<DialogClose asChild>
						<button
							type="button"
							className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							aria-label={t({ message: "Close" })}
						>
							<HiXMark className="size-4" />
						</button>
					</DialogClose>
				</div>

				<div className="flex min-h-0 flex-1 flex-col px-4 py-4">
					<input
						ref={titleInputRef}
						type="text"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
								event.preventDefault();
								handleCreate();
							}
						}}
						placeholder={t({ message: "Issue title" })}
						className="w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
					/>
					<div className="mt-5 flex-1">
						<MarkdownEditor
							content={description}
							onChange={setDescription}
							placeholder={t({ message: "Add description..." })}
							editorClassName="min-h-[240px] text-base leading-relaxed"
							onModEnter={handleCreate}
						/>
					</div>
					<div className="mt-4 flex flex-wrap items-center gap-2">
						<LinearPriorityMenu priority={priority} onSelect={setPriority}>
							<Button variant="outline" size="sm" className="h-8 gap-1.5">
								<PriorityIcon priority={priority} className="size-3.5" />
								<Trans>Priority</Trans>
							</Button>
						</LinearPriorityMenu>
						<LinearAssigneeMenu
							assigneeId={assigneeId}
							onSelect={setAssigneeId}
						>
							<Button variant="outline" size="sm" className="h-8 gap-1.5">
								{assignee ? (
									<Avatar
										size="xs"
										fullName={assignee.name}
										image={assignee.avatarUrl ?? undefined}
										className="rounded-full"
									/>
								) : (
									<HiOutlineUserCircle className="size-4" />
								)}
								{assignee?.name ?? t({ message: "Assignee" })}
							</Button>
						</LinearAssigneeMenu>
					</div>
				</div>

				<DialogFooter className="flex-row items-center justify-end border-t px-4 py-3">
					<Button
						onClick={handleCreate}
						disabled={
							!title.trim() || !selectedTeam || createMutation.isPending
						}
						className="h-10 rounded-full px-5 text-sm"
					>
						{createMutation.isPending ? (
							<Trans>Creating...</Trans>
						) : (
							<Trans>Create issue</Trans>
						)}
						{!createMutation.isPending && (
							<KbdGroup className="ml-1.5 opacity-70">
								<Kbd className="bg-primary-foreground/15 text-primary-foreground h-4 min-w-4 text-[10px]">
									{modKey}
								</Kbd>
								<Kbd className="bg-primary-foreground/15 text-primary-foreground h-4 min-w-4 text-[10px]">
									↵
								</Kbd>
							</KbdGroup>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
