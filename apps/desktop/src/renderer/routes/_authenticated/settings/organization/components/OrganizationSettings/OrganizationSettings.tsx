import {
	canRemoveMember,
	getRoleSortPriority,
	type OrganizationRole,
} from "@superset/shared/auth";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Badge } from "@superset/ui/badge";
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
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
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
	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="flex-1 min-w-0">
				<Label htmlFor={htmlFor} className="text-sm font-medium">
					{label}
				</Label>
				{hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
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

			const { mimeType } = parseBase64DataUrl(result.dataUrl);
			const ext = getImageExtensionFromMimeType(mimeType) ?? "png";

			const uploadResult = await apiTrpcClient.organization.uploadLogo.mutate({
				organizationId: organization.id,
				fileData: result.dataUrl,
				fileName: `logo.${ext}`,
				mimeType,
			});

			setLogoPreview(uploadResult.url);
			toast.success("Logo updated");
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
			toast.success("Organization name updated");
		} catch (error) {
			console.error("[organization-settings] Name update failed:", error);
			toast.error("Failed to update name");
			setNameValue(organization.name);
		}
	}

	if (!activeOrganizationId) {
		return (
			<div className="p-6 max-w-4xl w-full">
				<p className="text-sm text-muted-foreground">
					No organization selected
				</p>
			</div>
		);
	}

	if (isLoading || !organization) {
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

	const showOrgSettings = showLogo || showName || showSlug;
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
					<h2 className="text-xl font-semibold">Organization</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Manage your organization's branding and members.
					</p>
				</div>

				<div className="space-y-10">
					{showOrgSettings && (
						<section>
							<div>
								{showLogo && (
									<SettingsRow label="Logo" hint="Recommended size 256×256.">
										<button
											type="button"
											onClick={handleLogoUpload}
											disabled={!isOwner}
											className="rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-100"
											aria-label="Change organization logo"
										>
											<OrganizationLogo
												logo={logoPreview}
												name={organization.name}
											/>
										</button>
									</SettingsRow>
								)}

								{showName && (
									<SettingsRow label="Name" htmlFor="org-name">
										<Input
											id="org-name"
											value={nameValue}
											onChange={(e) => setNameValue(e.target.value)}
											onBlur={handleNameBlur}
											placeholder="Acme Inc."
											className="w-72"
											disabled={!isOwner}
										/>
									</SettingsRow>
								)}

								{showSlug && (
									<SettingsRow
										label="Slug"
										hint="Used in URLs and APIs."
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
							</div>

							{!isOwner && (
								<p className="text-xs text-muted-foreground mt-3">
									Only organization owners can modify these settings.
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
										<h3 className="text-sm font-medium">Members</h3>
										<p className="text-xs text-muted-foreground mt-0.5">
											Everyone with access to this organization.
										</p>
									</div>

									{isMembersLoading ? (
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
											No members yet.
										</div>
									) : (
										<div className="border rounded-lg overflow-hidden">
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
																					className="text-[10px] h-4 px-1.5"
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
				/>
			)}
		</>
	);
}
