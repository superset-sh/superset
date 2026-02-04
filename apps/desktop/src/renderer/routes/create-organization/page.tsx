import { zodResolver } from "@hookform/resolvers/zod";
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
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { z } from "zod";

export const Route = createFileRoute("/create-organization/")({
	component: CreateOrganization,
});

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
});

type FormValues = z.infer<typeof formSchema>;

export function CreateOrganization() {
	const { data: session } = authClient.useSession();
	const isSignedIn = !!session?.user;
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const signOutMutation = electronTrpc.auth.signOut.useMutation();
	const navigate = useNavigate();

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isCheckingSlug, setIsCheckingSlug] = useState(false);
	const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			slug: "",
		},
	});

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

	async function handleSignOut(): Promise<void> {
		await authClient.signOut();
		signOutMutation.mutate();
	}

	function renderSlugStatus(): ReactNode {
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

	async function onSubmit(values: FormValues): Promise<void> {
		setIsSubmitting(true);
		try {
			const organization = await apiTrpcClient.organization.create.mutate({
				name: values.name,
				slug: values.slug,
			});

			await authClient.organization.setActive({
				organizationId: organization.id,
			});

			toast.success("Organization created successfully!");
			navigate({ to: "/" });
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to create organization",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	if (!isSignedIn) {
		return <Navigate to="/sign-in" replace />;
	}

	if (activeOrganizationId) {
		return <Navigate to="/" replace />;
	}

	return (
		<div className="relative flex min-h-screen items-center justify-center bg-background p-4">
			<div className="absolute top-4 right-4">
				<Button variant="ghost" onClick={handleSignOut} type="button">
					Sign Out
				</Button>
			</div>

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
												{renderSlugStatus()}
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
								disabled={
									isSubmitting || isCheckingSlug || slugAvailable === false
								}
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
