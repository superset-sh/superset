import { msg } from "@lingui/core/macro";
import { CommentsSidebar, PageCommentsView } from "@superset/ui/page-comments";
import { TRPCClientError } from "@trpc/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { i18n } from "@/lib/i18n-server";
import { api } from "../../../trpc/server";
import { PageCommentsShell } from "./components/PageCommentsShell";
import { PageHeaderBar } from "./components/PageHeaderBar";
import { WrongOrganization } from "./components/WrongOrganization";
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

const pullVersions = cache(async (slug: string) => {
	const trpc = await api();
	return trpc.page.versions.query({ slug });
});

const pullAccess = cache(async (slug: string) => {
	const trpc = await api();
	return trpc.page.access.query({ slug });
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

	const [versions, access] = await Promise.all([
		pullVersions(slug),
		pullAccess(slug),
	]);

	return (
		<PageCommentsShell
			pageId={page.id}
			version={page.version}
			user={{
				id: session?.user.id ?? "",
				name: session?.user.name ?? i18n._(msg({ message: "You" })),
				image: session?.user.image ?? null,
			}}
		>
			<div className="flex h-dvh flex-col bg-background">
				<PageHeaderBar
					page={{
						id: page.id,
						title: page.title,
						url: page.url,
						visibility: page.visibility === "just_me" ? "just_me" : "org",
						createdByUserId: page.createdByUserId,
						owner: access.owner,
						updatedAt: page.updatedAt,
						sharedVersion: page.sharedVersion,
						latestVersion: page.latestVersion,
						servedVersion: page.servedVersion,
					}}
					versions={versions}
					currentUserId={session?.user.id}
					slug={slug}
					watching={page.watch.watching}
					watchAgentId={page.watch.agentId}
				/>

				<div className="flex min-h-0 flex-1">
					<main className="min-h-0 flex-1">
						<PageCommentsView src={page.viewUrl} title={page.title} />
					</main>
					<CommentsSidebar servedVersion={page.version} />
				</div>
			</div>
		</PageCommentsShell>
	);
}
