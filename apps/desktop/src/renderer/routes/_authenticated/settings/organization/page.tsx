import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@superset/ui/button";
import { Card, CardContent } from "@superset/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Form, FormControl, FormField, FormLabel, FormMessage } from "@superset/ui/form";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/settings/organization/")({
	component: OrganizationSettings,
});

const slugSchema = z.object({
	slug: z
		.string()
		.min(3, "Slug must be at least 3 characters")
		.max(50)
		.regex(
			/^[a-z0-9-]+$/,
			"Slug can only contain lowercase letters, numbers, and hyphens",
		)
		.regex(/^[a-z0-9]/, "Slug must start with a letter or number")
		.regex(/[a-z0-9]$/, "Slug must end with a letter or number"),
});

type SlugFormValues = z.infer<typeof slugSchema>;

export function OrganizationSettings() {
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;

	const [isSlugDialogOpen, setIsSlugDialogOpen] = useState(false);
	const [isCheckingSlug, setIsCheckingSlug] = useState(false);
	const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
	const [logoPreview, setLogoPreview] = useState<string | null>(null);
	const [nameValue, setNameValue] = useState("");

	// Fetch active organization data
	const { data: organization, refetch: refetchOrganization } =
		authClient.useActiveOrganization();

	// File selection mutation
	const selectImageMutation = electronTrpc.window.selectImageFile.useMutation();

	// Check current user's role in the organization
	const currentUserId = session?.user?.id;
	const currentMember = organization?.members?.find(
		(m) => m.userId === currentUserId,
	);
	const isOwner = currentMember?.role === "owner";

	const slugForm = useForm<SlugFormValues>({
		resolver: zodResolver(slugSchema),
		defaultValues: {
			slug: "",
		},
	});

	// Load organization data (only reset when org ID changes, not on every refetch)
	useEffect(() => {
		if (organization) {
			setNameValue(organization.name);
			slugForm.reset({
				slug: organization.slug,
			});
			setLogoPreview(organization.logo ?? null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [organization?.id]);

	// Debounced slug validation
	const slugValue = slugForm.watch("slug");
	const originalSlug = organization?.slug;
	useEffect(() => {
		if (!originalSlug || !isSlugDialogOpen) return;

		const timer = setTimeout(async () => {
			// Skip validation if slug hasn't changed
			if (slugValue === originalSlug) {
				setSlugAvailable(null);
				return;
			}

			if (!slugValue || slugValue.length < 3) {
				setSlugAvailable(null);
				return;
			}

			setIsCheckingSlug(true);
			try {
				const result = await authClient.organization.checkSlug({
					slug: slugValue,
				});

				setSlugAvailable(result.data?.status ?? null);
			} catch (error) {
				console.error("[organization-settings] Slug check failed:", error);
				setSlugAvailable(null);
			} finally {
				setIsCheckingSlug(false);
			}
		}, 500);

		return () => clearTimeout(timer);
	}, [slugValue, originalSlug, isSlugDialogOpen]);

	async function handleLogoUpload() {
		if (!organization) return;

		try {
			const result = await selectImageMutation.mutateAsync();

			if (result.canceled || !result.dataUrl) {
				return;
			}

			// Extract file info from data URL
			const mimeMatch = result.dataUrl.match(/^data:([^;]+);/);
			const mimeType = mimeMatch?.[1] || "image/png";
			const ext = mimeType.split("/")[1] || "png";
			const fileName = `logo.${ext}`;

			console.log("[organization-settings] Uploading logo to blob storage");

			// Upload to Vercel Blob via API
			const uploadResult = await apiTrpcClient.organization.uploadLogo.mutate({
				organizationId: organization.id,
				fileData: result.dataUrl,
				fileName: fileName,
				mimeType: mimeType,
			});

			// Update preview with blob URL
			setLogoPreview(uploadResult.url);

			await refetchOrganization();
			toast.success("Logo updated successfully!");
		} catch (error) {
			console.error("[organization-settings] Logo upload failed:", error);
			toast.error("Failed to update logo");
		}
	}

	async function handleNameBlur() {
		if (!organization || nameValue === organization.name) return;

		if (!nameValue || nameValue.length === 0) {
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

	async function handleSlugUpdate(values: SlugFormValues) {
		if (!organization) return;

		if (slugAvailable === false) {
			toast.error("Slug is already taken");
			return;
		}

		try {
			await apiTrpcClient.organization.update.mutate({
				id: organization.id,
				slug: values.slug,
			});

			await refetchOrganization();
			setIsSlugDialogOpen(false);
			setSlugAvailable(null);
			toast.success("Organization URL updated!");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update URL",
			);
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
					{/* Logo */}
					<li className="flex items-start justify-between gap-8">
						<div className="flex-1">
							<div className="text-sm font-medium mb-1">Logo</div>
							<div className="text-xs text-muted-foreground">
								Recommended size is 256x256px
							</div>
						</div>
						<div className="flex items-center gap-3">
							{organization.logo ? (
								<img
									src={organization.logo}
									alt="Organization logo"
									className="w-6 h-6 rounded object-cover"
								/>
							) : (
								<div className="w-6 h-6 rounded bg-muted flex items-center justify-center">
									<span className="text-xs font-medium text-muted-foreground">
										{organization.name.charAt(0).toUpperCase()}
									</span>
								</div>
							)}
						</div>
					</li>

					{/* Name */}
					<li className="flex items-center justify-between gap-8">
						<div className="flex-1 text-sm font-medium">Name</div>
						<div className="flex-1 text-sm text-muted-foreground">
							{organization.name}
						</div>
					</li>

					{/* URL */}
					<li className="flex items-center justify-between gap-8">
						<div className="flex-1 text-sm font-medium">URL</div>
						<div className="flex-1 text-sm text-muted-foreground">
							app.superset.sh/{organization.slug}
						</div>
					</li>
				</ul>

				<p className="text-xs text-muted-foreground mt-8">
					Only organization owners can modify these settings.
				</p>
			</div>
		);
	}

	function renderSlugStatus() {
		if (isCheckingSlug) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
					Checking...
				</span>
			);
		}
		if (slugAvailable === true) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600">
					Available
				</span>
			);
		}
		if (slugAvailable === false) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-destructive">
					Taken
				</span>
			);
		}
		return null;
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
						{/* Logo */}
						<li className="flex items-center justify-between gap-8 pb-6 border-b border-border">
							<div className="flex-1">
								<div className="text-sm font-medium mb-1">Logo</div>
								<div className="text-xs text-muted-foreground">
									Recommended size is 256x256px
								</div>
							</div>
							<div
								onClick={handleLogoUpload}
								className="relative w-8 h-8 cursor-pointer group"
							>
								{logoPreview ? (
									<img
										src={logoPreview}
										alt="Organization logo"
										className="w-8 h-8 rounded object-cover"
									/>
								) : (
									<div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
										<span className="text-sm font-medium text-muted-foreground">
											{organization.name.charAt(0).toUpperCase()}
										</span>
									</div>
								)}
								{/* Overlay on hover */}
								<div className="absolute inset-0 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
									<svg
										className="h-4 w-4 text-white"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
										/>
									</svg>
								</div>
							</div>
						</li>

						{/* Name */}
						<li className="flex items-center justify-between gap-8 pb-6 border-b border-border">
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

						{/* URL */}
						<li className="flex items-center justify-between gap-8">
							<div className="flex-1 text-sm font-medium">URL</div>
							<div className="flex-1 relative group">
								<Input
									value={`app.superset.sh/${organization.slug}`}
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
									<svg
										className="h-4 w-4"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
										/>
									</svg>
								</Button>
							</div>
						</li>
					</ul>
				</CardContent>
			</Card>

			{/* Slug Edit Dialog */}
			<Dialog open={isSlugDialogOpen} onOpenChange={setIsSlugDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Change organization slug</DialogTitle>
						<DialogDescription>
							This will change your organization's public URL. Make sure to update any
							bookmarks or shared links.
						</DialogDescription>
					</DialogHeader>
					<Form {...slugForm}>
						<form
							onSubmit={slugForm.handleSubmit(handleSlugUpdate)}
							className="space-y-4"
						>
							<FormField
								control={slugForm.control}
								name="slug"
								render={({ field }) => (
									<>
										<FormLabel>Organization slug</FormLabel>
										<FormControl>
											<div className="relative">
												<Input
													{...field}
													placeholder="acme-inc"
													className="pl-32"
												/>
												<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
													app.superset.sh/
												</span>
												{renderSlugStatus()}
											</div>
										</FormControl>
										<FormMessage />
									</>
								)}
							/>
							<DialogFooter>
								<Button
									type="button"
									variant="ghost"
									onClick={() => {
										setIsSlugDialogOpen(false);
										slugForm.reset({ slug: organization.slug });
										setSlugAvailable(null);
									}}
								>
									Cancel
								</Button>
								<Button
									type="submit"
									disabled={
										isCheckingSlug ||
										slugAvailable === false ||
										slugForm.watch("slug") === organization.slug
									}
								>
									Save
								</Button>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
