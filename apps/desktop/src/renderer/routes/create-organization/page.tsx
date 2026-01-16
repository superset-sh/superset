import { zodResolver } from "@hookform/resolvers/zod";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import { Card, CardContent, CardHeader } from "@superset/ui/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@superset/ui/form";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { HiUpload } from "react-icons/hi";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { z } from "zod";

export const Route = createFileRoute("/create-organization/")({
	component: CreateOrganization,
});

// Form schema (lighter - no Zod file validation)
const formSchema = z.object({
	name: z.string().min(1, "Organization name is required").max(100),
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
	logoFile: z.any().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateOrganization() {
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isCheckingSlug, setIsCheckingSlug] = useState(false);
	const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			slug: "",
			logoFile: undefined,
		},
	});

	// Auto-generate slug from organization name
	const nameValue = form.watch("name");
	useEffect(() => {
		const slug = nameValue
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");

		if (slug && slug !== form.getValues("slug")) {
			form.setValue("slug", slug, { shouldValidate: false });
		}
	}, [nameValue, form]);

	// Debounced slug validation (500ms)
	const slugValue = form.watch("slug");
	useEffect(() => {
		const timer = setTimeout(async () => {
			if (!slugValue || slugValue.length < 3) {
				setSlugAvailable(null);
				return;
			}

			setIsCheckingSlug(true);
			try {
				const result = await authClient.organization.checkSlug({
					slug: slugValue,
				});
				// status: true means slug is available, false means taken
				setSlugAvailable(result.data?.status ?? null);
			} catch (error) {
				console.error("[create-org] Slug check failed:", error);
				setSlugAvailable(null);
			} finally {
				setIsCheckingSlug(false);
			}
		}, 500);

		return () => clearTimeout(timer);
	}, [slugValue]);

	// Manual file validation for lighter bundle
	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];

			if (!file) {
				form.setValue("logoFile", undefined);
				setImagePreview(null);
				return;
			}

			// Validate file size (5MB max)
			if (file.size > 5 * 1024 * 1024) {
				toast.error("File size must be less than 5MB");
				e.target.value = "";
				return;
			}

			// Validate file type
			const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
			if (!validTypes.includes(file.type)) {
				toast.error("File must be a JPG, PNG, or WebP image");
				e.target.value = "";
				return;
			}

			// Set file and preview
			form.setValue("logoFile", file);
			const reader = new FileReader();
			reader.onloadend = () => {
				setImagePreview(reader.result as string);
			};
			reader.readAsDataURL(file);
		},
		[form],
	);

	// Three-step submit: create org → set as active → upload logo
	const onSubmit = async (values: FormValues) => {
		if (slugAvailable === false) {
			toast.error("Slug is already taken");
			return;
		}

		setIsSubmitting(true);
		try {
			// Step 1: Create organization
			const organization = await apiTrpcClient.organization.create.mutate({
				name: values.name,
				slug: values.slug,
			});

			// Step 2: Set new org as active in session
			await authClient.organization.setActive({
				organizationId: organization.id,
			});

			// Step 3: Upload logo using Vercel Blob SDK (if provided)
			if (values.logoFile && organization) {
				const file = values.logoFile as File;
				const ext = file.name.split(".").pop() || "png";
				const pathname = `organization/${organization.id}/logo.${ext}`;

				const { upload } = await import("@vercel/blob/client");
				await upload(pathname, file, {
					access: "public",
					handleUploadUrl: `${env.NEXT_PUBLIC_API_URL}/api/upload`,
					clientPayload: JSON.stringify({ organizationId: organization.id }),
				});
			}

			toast.success("Organization created successfully!");
			window.location.reload();
		} catch (error) {
			console.error("[create-org] Failed to create organization:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to create organization",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	// Guard: redirect to authenticated layout if user already has active org
	if (activeOrganizationId) {
		return <Navigate to="/" replace />;
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<h1 className="text-2xl font-bold">Create Organization</h1>
					<p className="text-sm text-muted-foreground">
						Set up your organization to get started
					</p>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
							{/* Organization Logo */}
							<FormField
								control={form.control}
								name="logoFile"
								render={() => (
									<FormItem>
										<FormLabel>Organization Logo (Optional)</FormLabel>
										<FormControl>
											<div className="flex items-center gap-4">
												<Avatar className="h-16 w-16">
													{imagePreview ? (
														<AvatarImage
															src={imagePreview}
															alt="Organization logo"
														/>
													) : (
														<AvatarFallback>
															<HiUpload className="h-6 w-6" />
														</AvatarFallback>
													)}
												</Avatar>
												<Input
													type="file"
													accept="image/jpeg,image/jpg,image/png,image/webp"
													onChange={handleFileChange}
													disabled={isSubmitting}
												/>
											</div>
										</FormControl>
										<FormDescription>
											JPG, PNG, or WebP. Max 5MB.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Organization Name */}
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Organization Name</FormLabel>
										<FormControl>
											<Input
												{...field}
												placeholder="Acme Inc."
												disabled={isSubmitting}
											/>
										</FormControl>
										<FormDescription>
											The name of your organization or team
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Slug */}
							<FormField
								control={form.control}
								name="slug"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Slug</FormLabel>
										<FormControl>
											<div className="relative">
												<Input
													{...field}
													placeholder="acme-inc"
													disabled={isSubmitting}
												/>
												{isCheckingSlug && (
													<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
														Checking...
													</span>
												)}
												{!isCheckingSlug && slugAvailable === true && (
													<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600">
														Available
													</span>
												)}
												{!isCheckingSlug && slugAvailable === false && (
													<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-destructive">
														Taken
													</span>
												)}
											</div>
										</FormControl>
										<FormDescription>
											A unique identifier for your organization (auto-generated
											from name)
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<Button
								type="submit"
								className="w-full"
								disabled={isSubmitting || slugAvailable === false}
							>
								{isSubmitting ? "Creating..." : "Create Organization"}
							</Button>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
