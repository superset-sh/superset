import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { ENVIRONMENT_ONBOARDING_PROMPT } from "@superset/shared/cloud-agent-launch";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuGitBranch, LuRefreshCw } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

type EnvironmentScope = "organization" | "personal";

export interface EnvironmentEditorSeed {
	id: string;
	name: string;
	scope: EnvironmentScope;
	repositoryIds: string[];
	hooksRepositoryId: string | null;
	/** A promoted environment's golden was built for its repositories. */
	repositoriesFrozen: boolean;
}

interface EnvironmentEditorDialogProps {
	organizationId: string;
	/** Absent for a new environment. */
	environment?: EnvironmentEditorSeed;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const NO_HOOKS = "none";

/**
 * Name, repositories, config location and scope for one environment. A new
 * environment can also be handed to an agent that installs what the project
 * needs and writes its hooks, in a cloud workspace opened right away.
 */
export function EnvironmentEditorDialog({
	organizationId,
	environment,
	open,
	onOpenChange,
}: EnvironmentEditorDialogProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const [name, setName] = useState(environment?.name ?? "");
	const [repositoryIds, setRepositoryIds] = useState<string[]>(
		environment?.repositoryIds ?? [],
	);
	const [hooksRepositoryId, setHooksRepositoryId] = useState<string | null>(
		environment?.hooksRepositoryId ?? null,
	);
	const [scope, setScope] = useState<EnvironmentScope>(
		environment?.scope ?? "organization",
	);
	const [repositoriesOpen, setRepositoriesOpen] = useState(false);
	const repositoriesFrozen = environment?.repositoriesFrozen ?? false;

	const repositoriesQuery =
		cloudTrpc.integration.github.listRepositories.useQuery(
			{ organizationId },
			{ enabled: open },
		);
	const repositories = repositoriesQuery.data ?? [];
	const selectedRepositories = repositoryIds
		.map((id) => repositories.find((repo) => repo.id === id))
		.filter((repo): repo is (typeof repositories)[number] => !!repo);
	const hooksChoice =
		hooksRepositoryId && repositoryIds.includes(hooksRepositoryId)
			? hooksRepositoryId
			: NO_HOOKS;

	const resync = cloudTrpc.integration.github.triggerSync.useMutation({
		onSuccess: async () => {
			await utils.integration.github.listRepositories.invalidate();
			toast.success(t({ message: "Repositories refreshed" }));
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	const create = cloudTrpc.environment.create.useMutation();
	const update = cloudTrpc.environment.update.useMutation();
	const createWorkspace = cloudTrpc.cloudWorkspace.create.useMutation();
	const busy =
		create.isPending || update.isPending || createWorkspace.isPending;
	const valid = name.trim().length > 0 && repositoryIds.length > 0;

	const body = () => ({
		name: name.trim(),
		repositoryIds,
		hooksRepositoryId: hooksChoice === NO_HOOKS ? null : hooksChoice,
		scope,
	});

	const save = async () => {
		if (environment) {
			await update.mutateAsync({ id: environment.id, ...body() });
			return environment.id;
		}
		const row = await create.mutateAsync({ organizationId, ...body() });
		return row.id;
	};

	const finish = async () => {
		await utils.environment.list.invalidate();
		onOpenChange(false);
	};

	const onSave = async () => {
		try {
			await save();
			toast.success(
				environment
					? t({ message: "Environment saved" })
					: t({ message: "Environment created" }),
			);
			await finish();
		} catch (error) {
			toast.error(errorMessage(error));
		}
	};

	const onStartAgent = async () => {
		try {
			const environmentId = await save();
			const created = await createWorkspace.mutateAsync({
				organizationId,
				environmentId,
				name: t({ message: `Set up ${name.trim()}` }),
				prompt: ENVIRONMENT_ONBOARDING_PROMPT,
				agent: "claude",
			});
			const listInput = { organizationId };
			await utils.cloudWorkspace.list.cancel(listInput);
			utils.cloudWorkspace.list.setData(listInput, (rows) =>
				rows ? [created, ...rows] : [created],
			);
			await finish();
			void navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: created.id },
			});
		} catch (error) {
			toast.error(errorMessage(error));
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{environment ? (
							<Trans>Edit environment</Trans>
						) : (
							<Trans>New environment</Trans>
						)}
					</DialogTitle>
					<DialogDescription>
						<Trans>
							The repositories a cloud workspace checks out, and which one's
							.superset/config.json it acts on. The workspace opens on the
							config location, or on the first repository by name.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="environment-name">
							<Trans>Name</Trans>
						</Label>
						<Input
							id="environment-name"
							onChange={(event) => setName(event.target.value)}
							placeholder={t({ message: "monorepo" })}
							value={name}
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="environment-repositories">
							<Trans>Repositories</Trans>
						</Label>
						<div className="flex items-center gap-2">
							<Popover
								onOpenChange={setRepositoriesOpen}
								open={repositoriesOpen}
							>
								<PopoverTrigger asChild>
									<Button
										className="flex-1 justify-between font-normal"
										disabled={repositoriesFrozen}
										id="environment-repositories"
										variant="outline"
									>
										<span className="truncate">
											{selectedRepositories.length === 0 ? (
												<span className="text-muted-foreground">
													<Trans>Select repositories</Trans>
												</span>
											) : (
												selectedRepositories
													.map((repo) => repo.fullName)
													.join(", ")
											)}
										</span>
										<HiChevronUpDown className="size-4 shrink-0 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent
									align="start"
									className="w-[var(--radix-popover-trigger-width)] p-0"
								>
									<Command>
										<CommandInput
											placeholder={t({ message: "Search repositories..." })}
										/>
										<CommandList className="max-h-64">
											<CommandEmpty>
												{repositoriesQuery.isLoading ? (
													<Trans>Loading repositories...</Trans>
												) : (
													<Trans>
														No repositories. Connect GitHub in Integrations,
														then refresh.
													</Trans>
												)}
											</CommandEmpty>
											<CommandGroup>
												{repositories.map((repo) => {
													const checked = repositoryIds.includes(repo.id);
													return (
														<CommandItem
															key={repo.id}
															onSelect={() =>
																setRepositoryIds(
																	checked
																		? repositoryIds.filter(
																				(id) => id !== repo.id,
																			)
																		: [...repositoryIds, repo.id],
																)
															}
															value={repo.fullName}
														>
															<LuGitBranch className="size-4 text-muted-foreground" />
															<span className="flex-1 truncate">
																{repo.fullName}
															</span>
															{checked && (
																<HiCheck className="size-4 shrink-0" />
															)}
														</CommandItem>
													);
												})}
											</CommandGroup>
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
							<Button
								aria-label={t({ message: "Refresh repositories" })}
								disabled={resync.isPending || repositoriesFrozen}
								onClick={() => resync.mutate({ organizationId })}
								size="icon"
								title={t({ message: "Refresh repositories" })}
								variant="outline"
							>
								<LuRefreshCw
									className={
										resync.isPending ? "size-4 animate-spin" : "size-4"
									}
								/>
							</Button>
						</div>
						{repositoriesFrozen && (
							<p className="text-xs text-muted-foreground">
								<Trans>
									This environment was promoted from a workspace, so its
									repositories are fixed. Promote a workspace again to change
									them.
								</Trans>
							</p>
						)}
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="environment-hooks">
							<Trans>Config location</Trans>
						</Label>
						<Select
							onValueChange={(value) =>
								setHooksRepositoryId(value === NO_HOOKS ? null : value)
							}
							value={hooksChoice}
						>
							<SelectTrigger id="environment-hooks">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NO_HOOKS}>
									<Trans>None</Trans>
								</SelectItem>
								{selectedRepositories.map((repo) => (
									<SelectItem key={repo.id} value={repo.id}>
										{repo.fullName}/.superset/config.json
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="environment-scope">
							<Trans>Scope</Trans>
						</Label>
						<Select
							onValueChange={(value) => setScope(value as EnvironmentScope)}
							value={scope}
						>
							<SelectTrigger id="environment-scope">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="organization">
									<Trans>Organization</Trans>
								</SelectItem>
								<SelectItem value="personal">
									<Trans>Personal</Trans>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button
						disabled={busy}
						onClick={() => onOpenChange(false)}
						variant="outline"
					>
						<Trans>Cancel</Trans>
					</Button>
					{environment ? (
						<Button disabled={!valid || busy} onClick={onSave}>
							<Trans>Save</Trans>
						</Button>
					) : (
						<>
							<Button
								disabled={!valid || busy}
								onClick={onSave}
								variant="secondary"
							>
								<Trans>Skip & save</Trans>
							</Button>
							<Button
								disabled={!valid || busy}
								onClick={onStartAgent}
								title={t({
									message:
										"Opens a cloud workspace where an agent installs what the project needs and writes its .superset/config.json",
								})}
							>
								<Trans>Start agent</Trans>
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
