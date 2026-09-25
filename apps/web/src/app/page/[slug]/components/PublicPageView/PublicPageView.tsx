"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { PageFrame } from "@superset/ui/page-comments";
import { Globe } from "lucide-react";
import Link from "next/link";
import { OpenInSupersetButton } from "../OpenInSupersetButton";

interface PublicPageViewProps {
	title: string;
	viewUrl: string;
	slug: string;
	signedIn: boolean;
}

export function PublicPageView({
	title,
	viewUrl,
	slug,
	signedIn,
}: PublicPageViewProps) {
	const { t } = useLingui();

	return (
		<div className="flex h-dvh flex-col bg-background">
			<div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
				<Globe
					className="size-3.5 shrink-0 text-muted-foreground"
					aria-label={t({ message: "Shared with everyone" })}
				/>
				<span className="min-w-0 truncate font-medium text-sm">{title}</span>
				<div className="ml-auto shrink-0">
					{signedIn ? (
						<OpenInSupersetButton slug={slug} />
					) : (
						<Button asChild size="xs">
							<Link
								href={{
									pathname: "/sign-in",
									query: { redirect: `/page/${slug}` },
								}}
							>
								<Trans>Sign in</Trans>
							</Link>
						</Button>
					)}
				</div>
			</div>

			<main className="min-h-0 flex-1">
				<PageFrame src={viewUrl} title={title} />
			</main>
		</div>
	);
}
