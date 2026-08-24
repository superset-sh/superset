import {
	CommentModeToggle,
	PageCommentsView,
} from "@superset/ui/page-comments";
import { TRPCClientError } from "@trpc/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { api } from "../../../trpc/server";
import { PageCommentsShell } from "./components/PageCommentsShell";
import { PageVisibilityMenu } from "./components/PageVisibilityMenu";
import { WrongOrganization } from "./components/WrongOrganization";
import { getPageContent } from "./utils/getPageContent";
import { getPagesAccess } from "./utils/getPagesAccess";
import { isForbidden, isNotFound } from "./utils/trpcErrors";

interface PageProps {
	params: Promise<{ slug: string }>;
}

// `api()` caches the client, not the result — this cache is what keeps
// generateMetadata and the component to a single pull.
const pullPage = cache(async (slug: string) => {
	const trpc = await api();
	return trpc.page.pull.query({ slug });
});

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const { hasPagesAccess } = await getPagesAccess();
	if (!hasPagesAccess) return { title: "Page" };
	try {
		const page = await pullPage(slug);
		return { title: page.title, description: page.description ?? undefined };
	} catch {
		return { title: "Page" };
	}
}

export default async function PublishedPage({ params }: PageProps) {
	const { slug } = await params;

	const { hasPagesAccess, session } = await getPagesAccess();
	if (!hasPagesAccess) notFound();

	let page: Awaited<ReturnType<typeof pullPage>>;
	try {
		page = await pullPage(slug);
	} catch (error) {
		if (isNotFound(error)) notFound();
		if (isForbidden(error) && error instanceof TRPCClientError) {
			return <WrongOrganization message={error.message} />;
		}
		throw error;
	}

	const html = await getPageContent({
		downloadUrl: page.downloadUrl,
		slug,
		version: page.version,
	});

	return (
		<PageCommentsShell
			pageId={page.id}
			version={page.version}
			user={{
				id: session?.user.id ?? "",
				name: session?.user.name ?? "You",
				image: session?.user.image ?? null,
			}}
		>
			<div className="flex h-dvh flex-col bg-background">
				<header className="flex h-11 shrink-0 items-center gap-x-3 border-b px-3">
					<div className="min-w-0 flex-1">
						<h1 className="truncate font-medium text-sm">{page.title}</h1>
						{page.description ? (
							<p className="truncate text-muted-foreground text-xs">
								{page.description}
							</p>
						) : null}
					</div>
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						v{page.version}
					</span>
					<PageVisibilityMenu
						pageId={page.id}
						visibility={page.visibility === "just_me" ? "just_me" : "org"}
						createdByUserId={page.createdByUserId}
					/>
					<CommentModeToggle />
				</header>

				<main className="min-h-0 flex-1">
					<PageCommentsView html={html} title={page.title} />
				</main>
			</div>
		</PageCommentsShell>
	);
}
