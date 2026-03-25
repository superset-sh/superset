import {
	canRemoveMember,
	getRoleSortPriority,
	type OrganizationRole,
} from "@superset/shared/auth";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Card, CardContent } from "@superset/ui/card";
import { Input } from "@superset/ui/input";
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
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useState } from "react";
import { HiOutlinePencil } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
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

export function OrganizationSettings({
	visibleItems,
}: OrganizationSettingsProps) {
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const collections = useCollections();

	const [isSlugDialogOpen, setIsSlugDialogOpen] = useState(false);
	const [logoPreview, setLogoPreview] = useState<string | null>(null);
	const [nameValue, setNameValue] = useState("");

	const { data: organizations, isLoading } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

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
	const showMembersList = isItemVisible(
		SETTING_ITEM_ID.ORGANIZATION_MEMBERS_LIST,
		visibleItems,
	);

	const { data: membersData, isLoading: isMembersLoading } = useLiveQuery(
		(q) =>
			q
				.from({ members: collections.members })
				.innerJoin({ users: collections.users }, ({ members, users }) =>
					eq(members.userId, users.id),
				)
				.select(({ members, users }) => ({
					...users,
					...members,
					memberId: members.id,
				}))
				.orderBy(({ members }) => members.role, "asc")
				.orderBy(({ members }) => members.createdAt, "asc"),
		[collections, activeOrganizationId],
	);

	const members: TeamMember[] = (membersData ?? [])
		.map((m) => ({
			...m,
			role: m.role as OrganizationRole,
		}))
		.sort((a, b) => {
			const priorityDiff =
				getRoleSortPriority(a.role) - getRoleSortPriority(b.role);
			if (priorityDiff !== 0) return priorityDiff;
			return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
		});
	const ownerCount = members.filter((m) => m.role === "owner").length;
	const currentMemberFromData = members.find((m) => m.userId === currentUserId);
	const currentUserRole = currentMemberFromData?.role;

	const formatDate = (date: Date | string) => {
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleDateString("en-US", {
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

			const mimeMatch = result.dataUrl.match(/^data:([^;]+);/);
			const mimeType = mimeMatch?.[1] || "image/png";
			const ext = mimeType.split("/")[1] || "png";

			const uploadResult = await apiTrpcClient.organization.uploadLogo.mutate({
				organizationId: organization.id,
				fileData: result.dataUrl,
				fileName: `logo.${ext}`,
				mimeType,
			});

			setLogoPreview(uploadResult.url);
			toast.success("Logo updated successfully!");
		} catch (error) {
			console.error("[organization-settings] Logo upload failed:", error);
			toast.error("Failed to update logo");
		}
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
			toast.success("Organization name updated!");
		} catch (error) {
			console.error("[organization-settings] Name update failed:", error);
			toast.error("Failed to update name");
			setNameValue(organization.name);
		}
	}

	if (!activeOrganizationId) {
		return (
			<div className="p-8">
				<p className="text-sm text-muted-foreground">
					No organization selected
				</p>
			</div>
		);
	}

	if (isLoading || !organization) {
		return (
			<div className="p-8 max-w-3xl">
				<Skeleton className="h-8 w-48 mb-8" />
				<div className="space-y-6">
					<div className="flex items-center justify-between gap-8">
						<div className="flex-1">
							<Skeleton className="h-4 w-24 mb-2" />
							<Skeleton className="h-3 w-48" />
						</div>
						<Skeleton className="h-8 w-8 rounded" />
					</div>
					<div className="flex items-center justify-between gap-8">
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-10 flex-1" />
					</div>
					<div className="flex items-center justify-between gap-8">
						<Skeleton className="h-4 w-12" />
						<Skeleton className="h-10 flex-1" />
					</div>
				</div>
			</div>
		);
	}

	const showOrgSettings = showLogo || showName || showSlug;
	const showMembersSection =
		showMembersList ||
		isItemVisible(SETTING_ITEM_ID.ORGANIZATION_MEMBERS_INVITE, visibleItems) ||
		isItemVisible(
			SETTING_ITEM_ID.ORGANIZATION_MEMBERS_PENDING_INVITATIONS,
			visibleItems,
		);

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<div className="flex-1 overflow-auto">
				<div className="p-8 space-y-12 max-w-5xl">
					{showOrgSettings && (
						<div>
							<h2 className="text-2xl font-semibold mb-2">Organization</h2>
							<p className="text-sm text-muted-foreground mb-6">
								Manage your organization's branding and settings
							</p>

							<Card>
								<CardContent>
									<ul className="space-y-6">
										{showLogo && (
											<li className="flex items-center justify-between gap-8 pb-6 border-b border-border">
												<div className="flex-1">
													<div className="text-sm font-medium mb-1">Logo</div>
													<div className="text-xs text-muted-foreground">
														Recommended size is 256x256px
													</div>
												</div>
												<button
													type="button"
													onClick={handleLogoUpload}
													disabled={!isOwner}
													className={`relative w-8 h-8 group ${
														isOwner ? "cursor-pointer" : ""
													}`}
												>
													<OrganizationLogo
														logo={logoPreview}
														name={organization.name}
													/>
													{isOwner && (
														<div className="absolute inset-0 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
															<HiOutlinePencil className="h-4 w-4 text-white" />
														</div>
													)}
												</button>
											</li>
										)}

										{showName && (
											<li
												className={`flex items-center justify-between gap-8 ${showSlug ? "pb-6 border-b border-border" : ""}`}
											>
												<div className="flex-1 text-sm font-medium">Name</div>
												<div className="flex-1">
													<Input
														value={nameValue}
														onChange={(e) => setNameValue(e.target.value)}
														onBlur={handleNameBlur}
														placeholder="Acme Inc."
														className="w-full"
														disabled={!isOwner}
													/>
												</div>
											</li>
										)}

										{showSlug && (
											<li className="flex items-center justify-between gap-8">
												<div className="flex-1 text-sm font-medium">Slug</div>
												<div className="flex-1 relative group">
													<Input
														value={organization.slug}
														readOnly
														onClick={() => isOwner && setIsSlugDialogOpen(true)}
														className={`w-full pr-8 ${isOwner ? "cursor-pointer" : ""}`}
														disabled={!isOwner}
													/>
													{isOwner && (
														<Button
															type="button"
															variant="ghost"
															size="icon"
															onClick={() => setIsSlugDialogOpen(true)}
															className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
														>
															<HiOutlinePencil className="h-4 w-4" />
														</Button>
													)}
												</div>
											</li>
										)}
									</ul>
								</CardContent>
							</Card>

							{!isOwner && (
								<p className="text-xs text-muted-foreground mt-4">
									Only organization owners can modify these settings.
								</p>
							)}
						</div>
					)}

					{showMembersSection && (
						<div className="space-y-8">
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
								<div className="space-y-4">
									<h3 className="text-lg font-semibold">Team Members</h3>

									{isMembersLoading ? (
										<div className="space-y-2 border rounded-lg">
											{[1, 2, 3].map((i) => (
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
										<div className="text-center py-12 text-muted-foreground border rounded-lg">
											No members yet
										</div>
									) : (
										<div className="border rounded-lg">
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead>Name</TableHead>
														<TableHead>Email</TableHead>
														<TableHead>Role</TableHead>
														<TableHead>Joined</TableHead>
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
																			<span className="font-medium">
																				{member.name || "Unknown"}
																			</span>
																			{isCurrentUserRow && (
																				<Badge
																					variant="secondary"
																					className="text-xs"
																				>
																					You
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
						</div>
					)}
				</div>
			</div>

			{isOwner && (
				<SlugDialog
					open={isSlugDialogOpen}
					onOpenChange={setIsSlugDialogOpen}
					organizationId={organization.id}
					currentSlug={organization.slug}
				/>
			)}
		</div>
	);
}
