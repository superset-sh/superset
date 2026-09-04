import { zodResolver } from "@hookform/resolvers/zod";
import { Trans, useLingui } from "@lingui/react/macro";
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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Redirect } from "renderer/components/Redirect";
import { useSignOut } from "renderer/hooks/useSignOut";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { z } from "zod";

export const Route = createFileRoute("/create-organization/")({
	component: CreateOrganization,
});

const signInRedirect = <Redirect to="/sign-in" replace />;

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
	const { t } = useLingui();
	const { data: session } = authClient.useSession();
	const isSignedIn = !!session?.user;
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const signOut = useSignOut();
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
		await signOut();
	}

	function renderSlugStatus(): ReactNode {
		if (isCheckingSlug) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
					<Trans>Checking...</Trans>
				</span>
			);
		}
		if (slugAvailable === true) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600">
					<Trans>Available</Trans>
				</span>
			);
		}
		if (slugAvailable === false) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-destructive">
					<Trans>Taken</Trans>
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
			// This route lives outside the authenticated layout, so navigating
			// back remounts CollectionsProvider, which seeds from the window
			// registry first. Without moving the window too, the registry's old
			// org wins and you are not taken into the org you just created.
			await electronTrpcClient.window.setActiveOrg.mutate({
				organizationId: organization.id,
			});

			toast.success(
				t({
					message: "Organization created successfully!",
				}),
			);
			navigate({ to: "/" });
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t({
							message: "Failed to create organization",
						}),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	if (!isSignedIn) {
		return signInRedirect;
	}

	const hasActiveOrganization = !!activeOrganizationId;

	return (
		<div className="relative flex min-h-screen items-center justify-center bg-background p-4">
			{/* Stops short of the top-right Cancel/Sign Out button. */}
			<div className="drag absolute left-0 right-32 top-0 h-12" />
			<div className="absolute top-4 right-4">
				{hasActiveOrganization ? (
					<Button
						variant="ghost"
						onClick={() => navigate({ to: "/" })}
						type="button"
					>
						<Trans>Cancel</Trans>
					</Button>
				) : (
					<Button variant="ghost" onClick={handleSignOut} type="button">
						<Trans>Sign Out</Trans>
					</Button>
				)}
			</div>

			<Card className="w-full max-w-md">
				<CardHeader>
					<h1 className="text-2xl font-bold">
						<Trans>Create Organization</Trans>
					</h1>
					<p className="text-sm text-muted-foreground">
						<Trans>Set up your organization to get started</Trans>
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
										<FormLabel>
											<Trans>Organization Name</Trans>
										</FormLabel>
										<FormControl>
											<Input
												{...field}
												placeholder={t({
													message: "Acme Inc.",
												})}
												disabled={isSubmitting}
											/>
										</FormControl>
										<FormDescription>
											<Trans>The name of your organization or team</Trans>
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
										<FormLabel>
											<Trans>Slug</Trans>
										</FormLabel>
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
											<Trans>
												A unique identifier for your organization
												(auto-generated from name)
											</Trans>
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
								{isSubmitting ? (
									<Trans>Creating...</Trans>
								) : (
									<Trans>Create Organization</Trans>
								)}
							</Button>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
