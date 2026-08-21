import { TRPCClientError } from "@trpc/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "../../../trpc/server";
import { PageFrame } from "./components/PageFrame";

interface PageProps {
	params: Promise<{ slug: string }>;
}

const CONTENT_TIMEOUT_MS = 10_000;

function isNotFound(error: unknown): boolean {
	return (
		error instanceof TRPCClientError &&
		(error.data?.code === "NOT_FOUND" ||
			error.shape?.data?.code === "NOT_FOUND")
	);
}

// Not in `publicRoutes`, so anonymous visitors are sent to sign-in — which
// matches the access model while `just_me` and `org` both require a session.
export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	try {
		const trpc = await api();
		const page = await trpc.page.get.query({ slug });
		return { title: page.title, description: page.description ?? undefined };
	} catch {
		return { title: "Page" };
	}
}

export default async function PublishedPage({ params }: PageProps) {
	const { slug } = await params;
	const trpc = await api();

	let page: Awaited<ReturnType<typeof trpc.page.get.query>>;
	try {
		page = await trpc.page.get.query({ slug });
	} catch (error) {
		if (isNotFound(error)) notFound();
		throw error;
	}

	let content: Awaited<ReturnType<typeof trpc.page.pull.query>>;
	try {
		content = await trpc.page.pull.query({ id: page.id });
	} catch (error) {
		if (isNotFound(error)) notFound();
		throw error;
	}

	// Fetched server-side because the blob store serves HTML as an attachment
	// under its own `default-src 'none'` CSP, and so the blob URL stays out of
	// the page source.
	let response: Response;
	try {
		response = await fetch(content.downloadUrl, {
			cache: "no-store",
			signal: AbortSignal.timeout(CONTENT_TIMEOUT_MS),
		});
	} catch (error) {
		console.error("[pages] page content fetch failed", {
			slug,
			version: content.version,
			error,
		});
		notFound();
	}
	if (!response.ok) {
		console.error("[pages] failed to fetch page content", {
			slug,
			version: content.version,
			status: response.status,
		});
		notFound();
	}
	const html = await response.text();

	return (
		<div className="flex h-dvh flex-col bg-background">
			<header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3">
				<div className="min-w-0 flex-1">
					<h1 className="truncate font-medium text-sm">{page.title}</h1>
					{page.description ? (
						<p className="truncate text-muted-foreground text-xs">
							{page.description}
						</p>
					) : null}
				</div>
				<span className="text-muted-foreground text-xs">
					v{content.version} ·{" "}
					{page.visibility === "just_me" ? "Private" : "Organization"}
				</span>
			</header>

			<main className="min-h-0 flex-1">
				<PageFrame html={html} title={page.title} />
			</main>
		</div>
	);
}
