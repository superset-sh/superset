import { msg } from "@lingui/core/macro";
import { pageCommentUser } from "@superset/shared/page-comments";
import {
	AllCommentsButton,
	CommentsPanel,
	PageCommentsView,
} from "@superset/ui/page-comments";
import { TRPCClientError } from "@trpc/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { initServerI18n } from "@/lib/i18n-server";
import { api } from "../../../trpc/server";
import { PageCommentsShell } from "./components/PageCommentsShell";
import { PageHeaderBar } from "./components/PageHeaderBar";
import { PageUnavailable } from "./components/PageUnavailable";
import { PublicPageView } from "./components/PublicPageView";
import { WrongOrganization } from "./components/WrongOrganization";
import { getSession } from "./utils/getSession";
import { allowPublicRead } from "./utils/publicReadLimit";
import { isForbidden, isNotFound } from "./utils/trpcErrors";

interface PageProps {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{ v?: string }>;
}

// `api()` caches the client, not the result — this cache is what keeps
// generateMetadata and the component to a single pull.
const pullPage = cache(async (slug: string, version: number | undefined) => {
	const trpc = await api();
	return trpc.page.pull.query({ slug, version });
});

function previewVersionOf(raw: string | undefined): number | undefined {
	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const ROBOTS = { index: false, follow: false } as const;

const pullVersions = cache(async (slug: string) => {
	const trpc = await api();
	return trpc.page.versions.query({ slug });
});

const pullAccess = cache(async (slug: string) => {
	const trpc = await api();
	return trpc.page.access.query({ slug });
});

const pullPublicPage = cache(async (slug: string) => {
	if (!(await allowPublicRead())) return null;
	const trpc = await api();
	return trpc.page.publicView.query({ slug });
});

export async function generateMetadata({
	params,
	searchParams,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const requestedVersion = previewVersionOf((await searchParams).v);
	const i18n = await initServerI18n();

	const shared = await pullPublicPage(slug).catch(() => null);
	if (shared) {
		const description = shared.description ?? undefined;
		const images = shared.thumbnailUrl
			? [
					{
						url: shared.thumbnailUrl,
						width: 1280,
						height: 880,
						alt: shared.title,
					},
				]
			: undefined;
		return {
			title: shared.title,
			description,
			robots: ROBOTS,
			openGraph: {
				type: "website",
				siteName: "Superset",
				url: shared.url,
				title: shared.title,
				description,
				images,
			},
			twitter: {
				card: images ? "summary_large_image" : "summary",
				title: shared.title,
				description,
				images,
			},
		};
	}

	if (await getSession()) {
		const page = await pullPage(slug, requestedVersion).catch(() => null);
		if (page) {
			return {
				title: page.title,
				description: page.description ?? undefined,
				robots: ROBOTS,
			};
		}
	}

	return {
		title: "Superset",
		description: i18n._(msg({ message: "Sign in to view this page" })),
		robots: ROBOTS,
	};
}

export default async function PublishedPage({
	params,
	searchParams,
}: PageProps) {
	const i18n = await initServerI18n();

	const { slug } = await params;
	const requestedVersion = previewVersionOf((await searchParams).v);

	const session = await getSession();

	const publicView = async () => {
		const shared = await pullPublicPage(slug);
		return shared ? (
			<PublicPageView
				title={shared.title}
				viewUrl={shared.viewUrl}
				slug={slug}
				signedIn={Boolean(session)}
			/>
		) : null;
	};

	if (!session) {
		return (await publicView()) ?? <PageUnavailable slug={slug} />;
	}

	let page: Awaited<ReturnType<typeof pullPage>>;
	try {
		page = await pullPage(slug, requestedVersion);
	} catch (error) {
		if (!isNotFound(error) && !isForbidden(error)) throw error;
		const view = requestedVersion === undefined ? await publicView() : null;
		if (view) return view;
		if (isNotFound(error)) notFound();
		if (error instanceof TRPCClientError) {
			return <WrongOrganization message={error.message} />;
		}
		throw error;
	}

	const [versions, access] = await Promise.all([
		pullVersions(slug),
		pullAccess(slug),
	]);

	const previewing = page.version !== page.servedVersion;

	return (
		<PageCommentsShell
			pageId={page.id}
			version={page.version}
			pageOwnerId={page.createdByUserId}
			readOnly={previewing}
			user={pageCommentUser(session, i18n._(msg({ message: "You" })))}
		>
			<div className="flex h-dvh flex-col bg-background">
				<PageHeaderBar
					page={{
						id: page.id,
						title: page.title,
						url: page.url,
						visibility: page.visibility,
						createdByUserId: page.createdByUserId,
						owner: access.owner,
						updatedAt: page.updatedAt,
						sharedVersion: page.sharedVersion,
						latestVersion: page.latestVersion,
						servedVersion: page.servedVersion,
					}}
					versions={versions}
					currentUserId={session.user.id}
					slug={slug}
					watching={page.watch.watching}
					watchAgentId={page.watch.agentId}
					previewVersion={
						page.version === page.servedVersion ? null : page.version
					}
				/>

				<div className="relative flex min-h-0 flex-1">
					<main className="min-h-0 flex-1">
						<PageCommentsView src={page.viewUrl} title={page.title} />
					</main>
					<AllCommentsButton />
					<CommentsPanel servedVersion={page.version} />
				</div>
			</div>
		</PageCommentsShell>
	);
}
