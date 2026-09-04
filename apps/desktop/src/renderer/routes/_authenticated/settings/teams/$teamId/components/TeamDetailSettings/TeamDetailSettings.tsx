import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatDate as formatLocaleDate } from "@superset/i18n/format";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
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
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { AddMemberButton } from "./components/AddMemberButton";

interface TeamDetailSettingsProps {
	teamId: string;
}

interface TeamMemberRow {
	teamMembershipId: string;
	userId: string;
	name: string | null;
	email: string;
	image: string | null;
	createdAt: Date;
}

type OpenDialog = "delete" | "leaveTeam" | null;

export function TeamDetailSettings({ teamId }: TeamDetailSettingsProps) {
	const { t } = useLingui();
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	// Per-window org, not the shared session: the session holds one org for
	// the whole app, so a second window on another org would render this
	// window against the other one's organization.
	const activeOrganizationId = useActiveOrganizationId();
	const currentUserId = session?.user?.id;

	const { data: teamsData, isPending: teamsPending } =
		cloudTrpc.organization.listTeams.useQuery(undefined);

	const { data: orgMembers, isPending: orgMembersPending } =
		cloudTrpc.organization.listMembers.useQuery(undefined);

	const orgUsers = useMemo(
		() => (orgMembers ?? []).map((member) => member.user),
		[orgMembers],
	);

	const team = useMemo(
		() => (teamsData ?? []).find((t) => t.id === teamId) ?? null,
		[teamsData, teamId],
	);

	const members: TeamMemberRow[] = useMemo(() => {
		const usersById = new Map(orgUsers.map((user) => [user.id, user]));
		return (team?.members ?? [])
			.map((row) => {
				const user = usersById.get(row.userId);
				return {
					teamMembershipId: row.id,
					userId: row.userId,
					name: user?.name ?? null,
					email: user?.email ?? "",
					image: user?.image ?? null,
					createdAt: row.createdAt ? new Date(row.createdAt) : new Date(0),
				};
			})
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	}, [team, orgUsers]);

	const currentMember = members.find((m) => m.userId === currentUserId);

	const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
	const [nameValue, setNameValue] = useState("");
	const [slugValue, setSlugValue] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Populate form once the team row arrives (and re-populate on navigation to
	// a different team). Keyed off team?.id — which is undefined until the query
	// resolves, then becomes teamId — so we don't seed empty strings before the
	// row is loaded, and later refetches of the same row don't clobber
	// in-progress edits.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only resync when the loaded team's id changes
	useEffect(() => {
		if (!team) return;
		setNameValue(team.name);
		setSlugValue(team.slug);
	}, [team?.id]);

	const formatDate = (date: Date) =>
		formatLocaleDate(date, { month: "short", day: "numeric" });

	const trimmedName = nameValue.trim();
	const trimmedSlug = slugValue.trim();
	const isDirty =
		!!team &&
		(trimmedName !== team.name || trimmedSlug !== team.slug) &&
		trimmedName.length > 0 &&
		trimmedSlug.length > 0;

	async function handleGeneralSave() {
		if (!team || !isDirty) return;
		setIsSubmitting(true);
		try {
			const result = await authClient.organization.updateTeam({
				teamId,
				data: { name: trimmedName, slug: trimmedSlug },
			});
			if (result.error) {
				toast.error(
					result.error.message ??
						t({
							message: "Failed to save team",
						}),
				);
				return;
			}
			await utils.organization.listTeams.invalidate();
			toast.success(t({ message: "Saved" }));
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to save team",
					}),
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleDelete() {
		if (!activeOrganizationId) return;
		setIsSubmitting(true);
		try {
			const result = await authClient.organization.removeTeam({
				teamId,
				organizationId: activeOrganizationId,
			});
			if (result.error) {
				toast.error(
					result.error.message ??
						t({
							message: "Failed to delete team",
						}),
				);
				return;
			}
			await utils.organization.listTeams.invalidate();
			const deletedName =
				team?.name ??
				t({
					message: "team",
				});
			toast.success(
				t({
					message: `Deleted "${deletedName}"`,
				}),
			);
			navigate({ to: "/settings/teams" });
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to delete team",
					}),
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleLeaveTeam() {
		if (!currentUserId) return;
		setIsSubmitting(true);
		try {
			await apiTrpcClient.team.removeMember.mutate({
				teamId,
				userId: currentUserId,
			});
			await utils.organization.listTeams.invalidate();
			toast.success(t({ message: "Left team" }));
			setOpenDialog(null);
			navigate({ to: "/settings/teams" });
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to leave team",
					}),
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	if (!activeOrganizationId) return null;

	const isPending = teamsPending || orgMembersPending;

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<div className="px-8 pt-8 pb-4">
				<div className="max-w-5xl">
					<Link
						to="/settings/teams"
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
					>
						<HiArrowLeft className="h-4 w-4" />
						<Trans>All teams</Trans>
					</Link>
					<h2 className="text-2xl font-semibold">
						<Trans>Team settings</Trans>
					</h2>
				</div>
			</div>

			<div className="flex-1 overflow-auto">
				<div className="px-8 pb-16 space-y-12">
					{team && (
						<div className="max-w-5xl">
							<div className="space-y-4 max-w-md">
								<div className="space-y-1.5">
									<Label htmlFor="team-name-edit">
										<Trans>Name</Trans>
									</Label>
									<Input
										id="team-name-edit"
										value={nameValue}
										onChange={(event) => setNameValue(event.target.value)}
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="team-slug-edit">
										<Trans>Slug</Trans>
									</Label>
									<Input
										id="team-slug-edit"
										value={slugValue}
										onChange={(event) => setSlugValue(event.target.value)}
									/>
									<p className="text-xs text-muted-foreground">
										<Trans>
											URL-friendly identifier, unique within your organization.
										</Trans>
									</p>
								</div>
								<div>
									<Button
										onClick={handleGeneralSave}
										disabled={!isDirty || isSubmitting}
									>
										{isSubmitting ? (
											<Trans>Saving...</Trans>
										) : (
											<Trans>Save</Trans>
										)}
									</Button>
								</div>
							</div>
						</div>
					)}

					<div className="max-w-5xl space-y-4">
						<div className="flex items-center justify-between gap-4">
							<h3 className="text-lg font-semibold">
								<Trans>Team members</Trans>
							</h3>
							{team && (
								<AddMemberButton
									teamId={teamId}
									currentUserId={currentUserId}
									currentMemberUserIds={new Set(members.map((m) => m.userId))}
									orgUsers={orgUsers ?? []}
								/>
							)}
						</div>

						{isPending ? (
							<div className="space-y-2 border rounded-lg">
								{[1, 2, 3].map((i) => (
									<div key={i} className="flex items-center gap-4 p-4">
										<Skeleton className="h-8 w-8 rounded-full" />
										<div className="flex-1 space-y-2">
											<Skeleton className="h-4 w-48" />
											<Skeleton className="h-3 w-32" />
										</div>
										<Skeleton className="h-4 w-16" />
									</div>
								))}
							</div>
						) : members.length === 0 ? (
							<div className="text-center py-12 text-muted-foreground border rounded-lg">
								<Trans>No members yet</Trans>
							</div>
						) : (
							<div className="border rounded-lg">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>
												<Trans>Name</Trans>
											</TableHead>
											<TableHead>
												<Trans>Email</Trans>
											</TableHead>
											<TableHead>
												<Trans>Joined</Trans>
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{members.map((member) => {
											const isCurrentUser = member.userId === currentUserId;
											return (
												<TableRow key={member.teamMembershipId}>
													<TableCell>
														<div className="flex items-center gap-3">
															<Avatar
																size="md"
																fullName={member.name ?? ""}
																image={member.image}
															/>
															<div className="flex items-center gap-2">
																<span className="font-medium">
																	{member.name ||
																		t({
																			message: "Unknown",
																			context: "person",
																		})}
																</span>
																{isCurrentUser && (
																	<Badge
																		variant="secondary"
																		className="text-xs"
																	>
																		<Trans>You</Trans>
																	</Badge>
																)}
															</div>
														</div>
													</TableCell>
													<TableCell className="text-muted-foreground">
														{member.email}
													</TableCell>
													<TableCell className="text-muted-foreground">
														{formatDate(member.createdAt)}
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</div>
						)}
					</div>

					{team && (
						<div className="max-w-5xl space-y-4">
							<h3 className="text-lg font-semibold">
								<Trans>Danger zone</Trans>
							</h3>
							<div className="border rounded-lg divide-y">
								{currentMember && (
									<div className="flex items-center justify-between gap-4 p-4">
										<div className="min-w-0">
											<p className="text-sm font-medium">
												<Trans>Leave team</Trans>
											</p>
											<p className="text-xs text-muted-foreground mt-0.5">
												<Trans>
													You'll stop being a member of this team. You can be
													re-added by another team member.
												</Trans>
											</p>
										</div>
										<Button
											variant="outline"
											onClick={() => setOpenDialog("leaveTeam")}
										>
											<Trans>Leave team</Trans>
										</Button>
									</div>
								)}
								<div className="flex items-center justify-between gap-4 p-4">
									<div className="min-w-0">
										<p className="text-sm font-medium">
											<Trans>Delete team</Trans>
										</p>
										<p className="text-xs text-muted-foreground mt-0.5">
											<Trans>
												Permanently remove <strong>{team.name}</strong> and all
												of its members. This can't be undone.
											</Trans>
										</p>
									</div>
									<Button
										variant="destructive"
										onClick={() => setOpenDialog("delete")}
									>
										<Trans>Delete team</Trans>
									</Button>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			<Dialog
				open={openDialog === "delete"}
				onOpenChange={(open) => !open && setOpenDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							<Trans>Delete team</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								This will delete <strong>{team?.name}</strong> and remove all of
								its members. This can't be undone.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpenDialog(null)}
							disabled={isSubmitting}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleDelete}
							disabled={isSubmitting}
						>
							{isSubmitting ? (
								<Trans>Deleting...</Trans>
							) : (
								<Trans>Delete team</Trans>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={openDialog === "leaveTeam"}
				onOpenChange={(open) => !open && setOpenDialog(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							<Trans>Leave team</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								You'll stop being a member of this team. You can be re-added by
								another team member.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpenDialog(null)}
							disabled={isSubmitting}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleLeaveTeam}
							disabled={isSubmitting}
						>
							{isSubmitting ? (
								<Trans>Leaving...</Trans>
							) : (
								<Trans>Leave team</Trans>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
