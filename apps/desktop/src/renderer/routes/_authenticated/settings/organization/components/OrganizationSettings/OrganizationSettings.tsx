import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatDate as formatLocaleDate } from "@superset/i18n/format";
import {
	canRemoveMember,
	getRoleSortPriority,
	type OrganizationRole,
} from "@superset/shared/auth";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
	HiOutlineClipboardDocument,
	HiOutlineClipboardDocumentCheck,
} from "react-icons/hi2";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	getImageExtensionFromMimeType,
	parseBase64DataUrl,
} from "shared/file-types";
import { MemberActions } from "../../../members/components/MembersSettings/components/MemberActions";
import { PendingInvitations } from "../../../members/components/PendingInvitations";
import type { TeamMember } from "../../../members/types";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { OrganizationLogo } from "./components/OrganizationLogo";
import { SlugDialog } from "./components/SlugDialog";

interface OrganizationSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

interface SettingsRowProps {
	label: string;
	hint?: string;
	htmlFor?: string;
	children: React.ReactNode;
}

function SettingsRow({ label, hint, htmlFor, children }: SettingsRowProps) {
	const searchQuery = useSettingsSearchQuery();

	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="flex-1 min-w-0">
				<Label htmlFor={htmlFor} className="text-sm font-medium">
					<HighlightText text={label} query={searchQuery} />
				</Label>
				{hint && (
					<p className="text-xs text-muted-foreground mt-0.5">
						<HighlightText text={hint} query={searchQuery} />
					</p>
				)}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

export function OrganizationSettings({
	visibleItems,
}: OrganizationSettingsProps) {
	const { t } = useLingui();
	const { data: session, refetch: refetchSession } = authClient.useSession();
	// Per-window org, not the shared session: the session holds one org for
	// the whole app, so a second window on another org would render this
	// window against the other one's organization.
	const activeOrganizationId = useActiveOrganizationId();
	const utils = cloudTrpc.useUtils();
	const navigate = useNavigate();
	const searchQuery = useSettingsSearchQuery();

	const [isSlugDialogOpen, setIsSlugDialogOpen] = useState(false);
	const [logoPreview, setLogoPreview] = useState<string | null>(null);
	const [nameValue, setNameValue] = useState("");
	const [deleteConfirmValue, setDeleteConfirmValue] = useState("");
	const [isDeletingOrg, setIsDeletingOrg] = useState(false);

	const { data: organizations, isPending } =
		cloudTrpc.organization.list.useQuery(undefined);

	const organization = organizations?.find(
		(o) => o.id === activeOrganizationId,
	);

	const { data: activeOrg } = authClient.useActiveOrganization();
	const currentUserId = session?.user?.id;
	const currentMember = activeOrg?.members?.find(
		(m) => m.userId === currentUserId,
	);
	const isOwner = currentMember?.role === "owner";

	const selectImageMutation = electronTrpc.window.selectImageFile.useMutation();

	const showLogo = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_LOGO,
		visibleItems,
	);
	const showName = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_NAME,
		visibleItems,
	);
	const showSlug = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_SLUG,
		visibleItems,
	);
	const showId = isItemVisible(SETTING_ITEM_ID.ORGANIZATION_ID, visibleItems);
	const { copyToClipboard, copied } = useCopyToClipboard();
	const showDelete = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_DELETE,
		visibleItems,
	);
	const showMembersList = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_MEMBERS_LIST,
		visibleItems,
	);

	const { data: membersData, isPending: membersPending } =
		cloudTrpc.organization.listMembers.useQuery({ includeDeactivated: true });

	const members: TeamMember[] = useMemo(() => {
		if (!activeOrganizationId) return [];
		return (membersData ?? [])
			.map((m) => ({
				memberId: m.id,
				userId: m.userId,
				organizationId: activeOrganizationId,
				role: m.role as OrganizationRole,
				createdAt: m.createdAt,
				name: m.user.name,
				email: m.user.email,
				image: m.user.image,
				deletionRequestedAt: m.user.deletionRequestedAt,
			}))
			.sort((a, b) => {
				const priorityDiff =
					getRoleSortPriority(a.role) - getRoleSortPriority(b.role);
				if (priorityDiff !== 0) return priorityDiff;
				return (
					new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
				);
			});
	}, [membersData, activeOrganizationId]);
	const ownerCount = members.filter((m) => m.role === "owner").length;
	const currentMemberFromData = members.find((m) => m.userId === currentUserId);
	const currentUserRole = currentMemberFromData?.role;

	const formatDate = (date: Date | string) => {
		const d = date instanceof Date ? date : new Date(date);
		return formatLocaleDate(d, {
			month: "short",
			day: "numeric",
		});
	};

	useEffect(() => {
		if (!organization) return;
		setNameValue(organization.name);
		setLogoPreview(organization.logo ?? null);
	}, [organization]);

	async function handleLogoUpload(): Promise<void> {
		if (!organization) return;

		try {
			const result = await selectImageMutation.mutateAsync();
			if (result.canceled || !result.dataUrl) return;

			const { mimeType } = parseBase64DataUrl(result.dataUrl);
			const ext = getImageExtensionFromMimeType(mimeType) ?? "png";

			const uploadResult = await apiTrpcClient.organization.uploadLogo.mutate({
				organizationId: organization.id,
				fileData: result.dataUrl,
				fileName: `logo.${ext}`,
				mimeType,
			});

			setLogoPreview(uploadResult.url);
			await utils.organization.list.invalidate();
			toast.success(
				t({
					message: "Logo updated",
				}),
			);
		} catch (error) {
			console.error("[organization-settings] Logo upload failed:", error);
			toast.error(
				t({
					message: "Failed to update logo",
				}),
			);
		}
	}

	async function deleteOrganization(): Promise<void> {
		if (!organization) return;
		const { error } = await authClient.organization.delete({
			organizationId: organization.id,
		});
		if (error) throw new Error(error.message);

		// The server nulls the active org during deletion; explicitly move the
		// session to the next org (or none) and re-enter the root gates, same
		// as the leave-organization flow.
		const remaining = (organizations ?? []).filter(
			(o) => o.id !== organization.id,
		);
		await authClient.organization.setActive({
			organizationId: remaining[0]?.id ?? null,
		});
		await refetchSession();
		await utils.invalidate();
		navigate({ to: "/" });
	}

	function handleDeleteOrganization(): void {
		setIsDeletingOrg(true);
		toast.promise(
			deleteOrganization().finally(() => {
				setIsDeletingOrg(false);
				setDeleteConfirmValue("");
			}),
			{
				loading: t({
					message: "Deleting organization...",
				}),
				success: t({
					message: "Organization deleted",
				}),
				error: (err) =>
					errorMessage(
						err,
						t({
							message: "Failed to delete organization",
						}),
					),
			},
		);
	}

	async function handleNameBlur(): Promise<void> {
		if (!organization || nameValue === organization.name) return;

		if (!nameValue) {
			setNameValue(organization.name);
			return;
		}

		try {
			await apiTrpcClient.organization.update.mutate({
				id: organization.id,
				name: nameValue,
			});
			await utils.organization.list.invalidate();
			toast.success(
				t({
					message: "Organization name updated",
				}),
			);
		} catch (error) {
			console.error("[organization-settings] Name update failed:", error);
			toast.error(
				t({
					message: "Failed to update name",
				}),
			);
			setNameValue(organization.name);
		}
	}

	if (!activeOrganizationId) {
		return (
			<div className="p-6 max-w-4xl w-full">
				<p className="text-sm text-muted-foreground">
					<Trans>No organization selected</Trans>
				</p>
			</div>
		);
	}

	if (!organization && isPending) {
		return (
			<div className="p-6 max-w-4xl w-full">
				<Skeleton className="h-7 w-40 mb-8" />
				<div className="space-y-4">
					{[0, 1, 2].map((i) => (
						<div
							key={i}
							className="flex items-center justify-between gap-8 py-4"
						>
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-9 w-72" />
						</div>
					))}
				</div>
			</div>
		);
	}

	if (!organization) {
		return (
			<div className="p-6 max-w-4xl w-full">
				<p className="text-sm text-muted-foreground select-text cursor-text">
					<Trans>Organization not found.</Trans>
				</p>
			</div>
		);
	}

	const showOrgSettings = showLogo || showName || showSlug || showId;
	const showMembersSection =
		showMembersList ||
		isItemVisible(SETTING_ITEM_ID.ORGANIZATION_MEMBERS_INVITE, visibleItems) ||
		isItemVisible(
			SETTING_ITEM_ID.ORGANIZATION_MEMBERS_PENDING_INVITATIONS,
			visibleItems,
		);

	return (
		<>
			<div className="p-6 max-w-4xl w-full">
				<div className="mb-8">
					<h2 className="text-xl font-semibold">
						<Trans>Organization</Trans>
					</h2>
					<p className="text-sm text-muted-foreground mt-1">
						<Trans>Manage your organization's branding and members.</Trans>
					</p>
				</div>

				<div className="space-y-10">
					{showOrgSettings && (
						<section>
							<div>
								{showLogo && (
									<SettingsRow
										label={t({
											message: "Logo",
										})}
										hint={t({
											message: "Recommended size 256×256.",
										})}
									>
										<button
											type="button"
											onClick={handleLogoUpload}
											disabled={!isOwner}
											className="rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-100"
											aria-label={t({
												message: "Change organization logo",
											})}
										>
											<OrganizationLogo
												logo={logoPreview}
												name={organization.name}
											/>
										</button>
									</SettingsRow>
								)}

								{showName && (
									<SettingsRow
										label={t({
											message: "Name",
										})}
										htmlFor="org-name"
									>
										<Input
											id="org-name"
											value={nameValue}
											onChange={(e) => setNameValue(e.target.value)}
											onBlur={handleNameBlur}
											placeholder={t({
												message: "Acme Inc.",
											})}
											className="w-72"
											disabled={!isOwner}
										/>
									</SettingsRow>
								)}

								{showSlug && (
									<SettingsRow
										label={t({
											message: "Slug",
										})}
										hint={t({
											message: "Used in URLs and APIs.",
										})}
										htmlFor="org-slug"
									>
										<Input
											id="org-slug"
											value={organization.slug}
											readOnly
											onClick={
												isOwner ? () => setIsSlugDialogOpen(true) : undefined
											}
											onKeyDown={
												isOwner
													? (event) => {
															if (event.key === "Enter" || event.key === " ") {
																event.preventDefault();
																setIsSlugDialogOpen(true);
															}
														}
													: undefined
											}
											className={`w-72 font-mono text-xs ${
												isOwner ? "cursor-pointer" : ""
											}`}
											disabled={!isOwner}
										/>
									</SettingsRow>
								)}

								{showId && (
									<SettingsRow
										label={t({
											message: "ID",
										})}
										hint={t({
											message: "Use this when calling the Superset API.",
										})}
										htmlFor="org-id"
									>
										<button
											type="button"
											id="org-id"
											onClick={() => copyToClipboard(organization.id)}
											aria-label={t({
												message: "Copy organization ID",
											})}
											className="group relative block w-72 cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<Input
												value={organization.id}
												readOnly
												tabIndex={-1}
												className="w-full font-mono text-xs pr-10 select-none caret-transparent cursor-pointer pointer-events-none group-hover:bg-accent"
											/>
											<Tooltip>
												<TooltipTrigger asChild>
													<span className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground group-hover:bg-secondary/80">
														{copied ? (
															<HiOutlineClipboardDocumentCheck className="h-4 w-4" />
														) : (
															<HiOutlineClipboardDocument className="h-4 w-4" />
														)}
													</span>
												</TooltipTrigger>
												<TooltipContent>
													{copied ? (
														<Trans>Copied!</Trans>
													) : (
														<Trans>Copy</Trans>
													)}
												</TooltipContent>
											</Tooltip>
										</button>
									</SettingsRow>
								)}
							</div>

							{!isOwner && (
								<p className="text-xs text-muted-foreground mt-3">
									<Trans>
										Only organization owners can modify these settings.
									</Trans>
								</p>
							)}
						</section>
					)}

					{showMembersSection && (
						<section className="space-y-6">
							{currentUserRole &&
								activeOrganizationId &&
								organization?.name && (
									<PendingInvitations
										visibleItems={visibleItems}
										currentUserRole={currentUserRole}
										organizationId={activeOrganizationId}
										organizationName={organization.name}
									/>
								)}

							{showMembersList && (
								<div>
									<div className="mb-3">
										<h3 className="text-sm font-medium">
											<HighlightText
												text={t({
													message: "Members",
												})}
												query={searchQuery}
											/>
										</h3>
										<p className="text-xs text-muted-foreground mt-0.5">
											<Trans>Everyone with access to this organization.</Trans>
										</p>
									</div>

									{membersPending && members.length === 0 ? (
										<div className="border rounded-lg divide-y divide-border">
											{[0, 1, 2].map((i) => (
												<div key={i} className="flex items-center gap-4 p-4">
													<Skeleton className="h-8 w-8 rounded-full" />
													<div className="flex-1 space-y-2">
														<Skeleton className="h-4 w-48" />
														<Skeleton className="h-3 w-32" />
													</div>
													<Skeleton className="h-4 w-16" />
													<Skeleton className="h-4 w-20" />
												</div>
											))}
										</div>
									) : members.length === 0 ? (
										<div className="text-center py-12 text-sm text-muted-foreground border rounded-lg">
											<Trans>No members yet.</Trans>
										</div>
									) : (
										<div className="border rounded-lg overflow-hidden">
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
															<Trans>Role</Trans>
														</TableHead>
														<TableHead>
															<Trans>Joined</Trans>
														</TableHead>
														<TableHead className="w-[50px]" />
													</TableRow>
												</TableHeader>
												<TableBody>
													{members.map((member) => {
														const isCurrentUserRow =
															member.userId === currentUserId;

														return (
															<TableRow key={member.memberId}>
																<TableCell>
																	<div className="flex items-center gap-3">
																		<Avatar
																			size="md"
																			fullName={member.name}
																			image={member.image}
																		/>
																		<div className="flex items-center gap-2">
																			<span
																				className={
																					member.deletionRequestedAt
																						? "font-medium text-muted-foreground"
																						: "font-medium"
																				}
																			>
																				{member.name ||
																					t({
																						message: "Unknown",
																						context: "person",
																					})}
																			</span>
																			{isCurrentUserRow && (
																				<Badge
																					variant="secondary"
																					className="text-[10px] h-4 px-1.5"
																				>
																					<Trans>You</Trans>
																				</Badge>
																			)}
																			{member.deletionRequestedAt && (
																				<Badge
																					variant="outline"
																					className="text-[10px] h-4 px-1.5 text-muted-foreground"
																				>
																					<Trans>Deactivated</Trans>
																				</Badge>
																			)}
																		</div>
																	</div>
																</TableCell>
																<TableCell className="text-muted-foreground">
																	{member.email}
																</TableCell>
																<TableCell>
																	<Badge
																		variant={
																			member.role === "owner"
																				? "default"
																				: "outline"
																		}
																		className="text-xs capitalize"
																	>
																		{member.role}
																	</Badge>
																</TableCell>
																<TableCell className="text-muted-foreground">
																	{formatDate(member.createdAt)}
																</TableCell>
																<TableCell>
																	{currentUserRole && (
																		<MemberActions
																			member={member}
																			currentUserRole={currentUserRole}
																			ownerCount={ownerCount}
																			isCurrentUser={isCurrentUserRow}
																			canRemove={canRemoveMember(
																				currentUserRole,
																				member.role,
																				isCurrentUserRow,
																				ownerCount,
																			)}
																		/>
																	)}
																</TableCell>
															</TableRow>
														);
													})}
												</TableBody>
											</Table>
										</div>
									)}
								</div>
							)}
						</section>
					)}

					{showDelete && isOwner && (
						<section>
							<SettingsRow
								label={t({
									message: "Delete organization",
								})}
							>
								<AlertDialog
									onOpenChange={(open) => {
										if (!open) setDeleteConfirmValue("");
									}}
								>
									<AlertDialogTrigger asChild>
										<Button variant="destructive" disabled={isDeletingOrg}>
											{isDeletingOrg ? (
												<Trans>Deleting…</Trans>
											) : (
												<Trans>Delete organization</Trans>
											)}
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>
												<Trans>Delete {organization.name}?</Trans>
											</AlertDialogTitle>
											<AlertDialogDescription>
												{members.length > 1 ? (
													<Trans>
														All data will be permanently deleted for all{" "}
														{members.length} members — this cannot be undone.
													</Trans>
												) : (
													<Trans>
														All of the organization's data will be permanently
														deleted — this cannot be undone.
													</Trans>
												)}{" "}
												<Trans>Type the organization name to confirm.</Trans>
											</AlertDialogDescription>
										</AlertDialogHeader>
										<Input
											value={deleteConfirmValue}
											onChange={(e) => setDeleteConfirmValue(e.target.value)}
											placeholder={organization.name}
										/>
										<AlertDialogFooter>
											<AlertDialogCancel>
												<Trans>Cancel</Trans>
											</AlertDialogCancel>
											<AlertDialogAction
												variant="destructive"
												disabled={deleteConfirmValue !== organization.name}
												onClick={handleDeleteOrganization}
											>
												<Trans>Delete organization</Trans>
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</SettingsRow>
						</section>
					)}
				</div>
			</div>

			{isOwner && (
				<SlugDialog
					open={isSlugDialogOpen}
					onOpenChange={setIsSlugDialogOpen}
					organizationId={organization.id}
					currentSlug={organization.slug}
					onSuccess={() => utils.organization.list.invalidate()}
				/>
			)}
		</>
	);
}
