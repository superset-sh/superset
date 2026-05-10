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
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { LocaleSwitcher } from "renderer/components/LocaleSwitcher";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { z } from "zod";

export const Route = createFileRoute("/create-organization/")({
	component: CreateOrganization,
});

type FormValues = {
	name: string;
	slug: string;
};

export function CreateOrganization() {
	const { t, i18n } = useTranslation();
	const formSchema = useMemo(
		() =>
			z.object({
				name: z.string().min(1, t("createOrg.nameRequired")).max(100),
				slug: z
					.string()
					.min(3, t("createOrg.slugMinLength"))
					.max(50)
					.regex(/^[a-z0-9-]+$/, t("createOrg.slugChars"))
					.regex(/^[a-z0-9]/, t("createOrg.slugStart"))
					.regex(/[a-z0-9]$/, t("createOrg.slugEnd")),
			}),
		[t],
	);

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

	useEffect(() => {
		const refreshErrors = (): void => {
			const { isSubmitted, touchedFields } = form.formState;
			if (isSubmitted || Object.keys(touchedFields).length > 0) {
				void form.trigger();
			}
		};
		i18n.on("languageChanged", refreshErrors);
		return () => {
			i18n.off("languageChanged", refreshErrors);
		};
	}, [form, i18n]);

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
					{t("createOrg.slugChecking")}
				</span>
			);
		}
		if (slugAvailable === true) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600">
					{t("createOrg.slugAvailable")}
				</span>
			);
		}
		if (slugAvailable === false) {
			return (
				<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-destructive">
					{t("createOrg.slugTaken")}
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

			toast.success(t("createOrg.successToast"));
			navigate({ to: "/" });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("createOrg.errorToast"),
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
			<div className="absolute top-4 right-4 flex items-center gap-2">
				<LocaleSwitcher />
				<Button variant="ghost" onClick={handleSignOut} type="button">
					{t("createOrg.signOut")}
				</Button>
			</div>

			<Card className="w-full max-w-md">
				<CardHeader>
					<h1 className="text-2xl font-bold">{t("createOrg.title")}</h1>
					<p className="text-sm text-muted-foreground">
						{t("createOrg.subtitle")}
					</p>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("createOrg.nameLabel")}</FormLabel>
										<FormControl>
											<Input
												{...field}
												placeholder={t("createOrg.namePlaceholder")}
												disabled={isSubmitting}
											/>
										</FormControl>
										<FormDescription>
											{t("createOrg.nameDescription")}
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
										<FormLabel>{t("createOrg.slugLabel")}</FormLabel>
										<FormControl>
											<div className="relative">
												<Input
													{...field}
													placeholder={t("createOrg.slugPlaceholder")}
													disabled={isSubmitting}
												/>
												{renderSlugStatus()}
											</div>
										</FormControl>
										<FormDescription>
											{t("createOrg.slugDescription")}
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
								{isSubmitting
									? t("createOrg.submitting")
									: t("createOrg.submit")}
							</Button>
						</form>
					</Form>
				</CardContent>
			</Card>
		</div>
	);
}
