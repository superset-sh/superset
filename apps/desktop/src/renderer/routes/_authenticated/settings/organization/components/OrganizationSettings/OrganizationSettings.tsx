import { Button } from "@superset/ui/button";
import { Card, CardContent } from "@superset/ui/card";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { HiOutlinePencil } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
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

	const [isSlugDialogOpen, setIsSlugDialogOpen] = useState(false);
	const [logoPreview, setLogoPreview] = useState<string | null>(null);
	const [nameValue, setNameValue] = useState("");

	const { data: organization, refetch: refetchOrganization } =
		authClient.useActiveOrganization();

	const selectImageMutation = electronTrpc.window.selectImageFile.useMutation();

	const currentUserId = session?.user?.id;
	const currentMember = organization?.members?.find(
		(m) => m.userId === currentUserId,
	);
	const isOwner = currentMember?.role === "owner";

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only sync on organization change
	useEffect(() => {
		if (!organization) return;
		setNameValue(organization.name);
		setLogoPreview(organization.logo ?? null);
	}, [organization?.id]);

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
			await refetchOrganization();
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
			await refetchOrganization();
			toast.success("Organization name updated!");
		} catch (error) {
			console.error("[organization-settings] Name update failed:", error);
			toast.error("Failed to update name");
			setNameValue(organization.name);
		}
	}

	if (!activeOrganizationId || !organization) {
		return (
			<div className="p-8">
				<p className="text-sm text-muted-foreground">
					No organization selected
				</p>
			</div>
		);
	}

	if (!isOwner) {
		return (
			<div className="p-8 max-w-3xl">
				<h1 className="text-2xl font-semibold mb-8">Organization</h1>

				<ul className="space-y-6">
					{showLogo && (
						<li className="flex items-start justify-between gap-8">
							<div className="flex-1">
								<div className="text-sm font-medium mb-1">Logo</div>
								<div className="text-xs text-muted-foreground">
									Recommended size is 256x256px
								</div>
							</div>
							<OrganizationLogo
								logo={organization.logo}
								name={organization.name}
								size="sm"
							/>
						</li>
					)}

					{showName && (
						<li className="flex items-center justify-between gap-8">
							<div className="flex-1 text-sm font-medium">Name</div>
							<div className="flex-1 text-sm text-muted-foreground">
								{organization.name}
							</div>
						</li>
					)}

					{showSlug && (
						<li className="flex items-center justify-between gap-8">
							<div className="flex-1 text-sm font-medium">Slug</div>
							<div className="flex-1 text-sm text-muted-foreground">
								{organization.slug}
							</div>
						</li>
					)}
				</ul>

				<p className="text-xs text-muted-foreground mt-8">
					Only organization owners can modify these settings.
				</p>
			</div>
		);
	}

	return (
		<div className="p-8 max-w-3xl">
			<h1 className="text-2xl font-semibold mb-2">Organization</h1>
			<p className="text-sm text-muted-foreground mb-8">
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
									className="relative w-8 h-8 cursor-pointer group"
								>
									<OrganizationLogo
										logo={logoPreview}
										name={organization.name}
									/>
									<div className="absolute inset-0 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
										<HiOutlinePencil className="h-4 w-4 text-white" />
									</div>
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
										onClick={() => setIsSlugDialogOpen(true)}
										className="w-full cursor-pointer pr-8"
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={() => setIsSlugDialogOpen(true)}
										className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
									>
										<HiOutlinePencil className="h-4 w-4" />
									</Button>
								</div>
							</li>
						)}
					</ul>
				</CardContent>
			</Card>

			<SlugDialog
				open={isSlugDialogOpen}
				onOpenChange={setIsSlugDialogOpen}
				organizationId={organization.id}
				currentSlug={organization.slug}
				onSuccess={refetchOrganization}
			/>
		</div>
	);
}
