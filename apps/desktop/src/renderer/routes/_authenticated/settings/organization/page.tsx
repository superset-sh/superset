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
import {
	Form,
	FormControl,
	FormField,
	FormLabel,
	FormMessage,
} from "@superset/ui/form";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { z } from "zod";
import { EditIcon } from "./components/EditIcon";
import { OrganizationLogo } from "./components/OrganizationLogo";

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

	const { data: organization, refetch: refetchOrganization } =
		authClient.useActiveOrganization();

	const selectImageMutation = electronTrpc.window.selectImageFile.useMutation();

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only sync on organization change
	useEffect(() => {
		if (!organization) return;
		setNameValue(organization.name);
		slugForm.reset({ slug: organization.slug });
		setLogoPreview(organization.logo ?? null);
	}, [organization?.id]);

	const slugValue = slugForm.watch("slug");
	const originalSlug = organization?.slug;
	useEffect(() => {
		if (!originalSlug || !isSlugDialogOpen) return;

		const timer = setTimeout(async () => {
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

	async function handleSlugUpdate(values: SlugFormValues): Promise<void> {
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
			const message =
				error instanceof Error ? error.message : "Failed to update URL";
			toast.error(message);
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

					<li className="flex items-center justify-between gap-8">
						<div className="flex-1 text-sm font-medium">Name</div>
						<div className="flex-1 text-sm text-muted-foreground">
							{organization.name}
						</div>
					</li>

					<li className="flex items-center justify-between gap-8">
						<div className="flex-1 text-sm font-medium">Slug</div>
						<div className="flex-1 text-sm text-muted-foreground">
							{organization.slug}
						</div>
					</li>
				</ul>

				<p className="text-xs text-muted-foreground mt-8">
					Only organization owners can modify these settings.
				</p>
			</div>
		);
	}

	function getSlugStatusDisplay(): { text: string; className: string } | null {
		if (isCheckingSlug) {
			return { text: "Checking...", className: "text-muted-foreground" };
		}
		if (slugAvailable === true) {
			return { text: "Available", className: "text-green-600" };
		}
		if (slugAvailable === false) {
			return { text: "Taken", className: "text-destructive" };
		}
		return null;
	}

	const slugStatus = getSlugStatusDisplay();

	return (
		<div className="p-8 max-w-3xl">
			<h1 className="text-2xl font-semibold mb-2">Organization</h1>
			<p className="text-sm text-muted-foreground mb-8">
				Manage your organization's branding and settings
			</p>

			<Card>
				<CardContent>
					<ul className="space-y-6">
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
								<OrganizationLogo logo={logoPreview} name={organization.name} />
								<div className="absolute inset-0 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
									<EditIcon className="h-4 w-4 text-white" />
								</div>
							</button>
						</li>

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
									<EditIcon className="h-4 w-4" />
								</Button>
							</div>
						</li>
					</ul>
				</CardContent>
			</Card>

			<Dialog open={isSlugDialogOpen} onOpenChange={setIsSlugDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Change organization slug</DialogTitle>
						<DialogDescription>
							This will change your organization's public URL. Make sure to
							update any bookmarks or shared links.
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
												<Input {...field} placeholder="acme-inc" />
												{slugStatus && (
													<span
														className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${slugStatus.className}`}
													>
														{slugStatus.text}
													</span>
												)}
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
										slugValue === organization.slug
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
