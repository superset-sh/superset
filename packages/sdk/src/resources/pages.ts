import type { APIPromise } from "../core/api-promise";
import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Base64 of the UTF-8 bytes, without relying on a Node-only `Buffer`. */
function base64Utf8(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/** The API takes exactly one of `id` or `slug`; a UUID is an id, anything else a slug. */
function pageRef(idOrSlug: string): { id: string } | { slug: string } {
	return UUID.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug };
}

export class PageComments extends APIResource {
	/**
	 * List comment threads on a page, oldest first, each with its replies and
	 * resolved state.
	 *
	 * Mirrors `superset pages comments list --page <idOrSlug>`.
	 */
	list(
		params: PageCommentListParams,
		options?: RequestOptions,
	): APIPromise<PageCommentListResponse> {
		return this._client.query<PageCommentListResponse>(
			{ method: "pages.comments.list", procedure: "pageComment.list" },
			{ pageId: params.pageId, activatedOnly: params.activatedOnly },
			options,
		);
	}

	/**
	 * Post a reply into a comment thread.
	 *
	 * Mirrors `superset pages comments reply --thread-id <id> <body>`.
	 */
	reply(
		params: PageCommentReplyParams,
		options?: RequestOptions,
	): APIPromise<PageCommentReplyResult> {
		return this._client.mutation<PageCommentReplyResult>(
			{ method: "pages.comments.reply", procedure: "pageComment.reply" },
			{
				threadId: params.threadId,
				body: params.body,
				agentSessionId: params.agentSessionId,
			},
			options,
		);
	}

	/**
	 * Mark a thread resolved, or reopen it with `resolved: false`.
	 *
	 * Mirrors `superset pages comments resolve --thread-id <id>` / `--reopen`.
	 */
	resolve(
		params: PageCommentResolveParams,
		options?: RequestOptions,
	): APIPromise<PageCommentResolveResult> {
		return this._client.mutation<PageCommentResolveResult>(
			{ method: "pages.comments.resolve", procedure: "pageComment.resolve" },
			{ threadId: params.threadId, resolved: params.resolved ?? true },
			options,
		);
	}
}

/**
 * A page is one self-contained HTML document published to a shareable URL.
 * Every publish creates a new version; nothing is overwritten.
 *
 * Mirrors the CLI's `superset pages …` commands.
 */
export class Pages extends APIResource {
	/** Comment threads on a page: list, reply, resolve. */
	comments: PageComments = new PageComments(this._client);

	/**
	 * List pages in the active organization, newest activity first, optionally
	 * only those published from one workspace.
	 *
	 * Mirrors `superset pages list`.
	 */
	list(
		params?: PageListParams | null,
		options?: RequestOptions,
	): APIPromise<PageListResponse> {
		return this._client.query<PageListResponse>(
			{ method: "pages.list", procedure: "page.list" },
			params?.workspaceId ? { workspaceId: params.workspaceId } : undefined,
			options,
		);
	}

	/**
	 * Get one page's metadata by id or slug: title, visibility, URL, the
	 * version currently served, and whether an agent is watching it.
	 *
	 * Mirrors `superset pages get <idOrSlug>`.
	 */
	retrieve(idOrSlug: string, options?: RequestOptions): APIPromise<Page> {
		return this._client.query<Page>(
			{ method: "pages.retrieve", procedure: "page.get" },
			pageRef(idOrSlug),
			options,
		);
	}

	/**
	 * List a page's versions, newest first.
	 *
	 * Mirrors `superset pages versions <idOrSlug>`.
	 */
	versions(
		idOrSlug: string,
		options?: RequestOptions,
	): APIPromise<PageVersionListResponse> {
		return this._client.query<PageVersionListResponse>(
			{ method: "pages.versions", procedure: "page.versions" },
			pageRef(idOrSlug),
			options,
		);
	}

	/**
	 * Resolve a version's metadata plus a short-lived `downloadUrl` for its
	 * HTML. Defaults to the version currently served. Fetch `downloadUrl`
	 * yourself to get the document body.
	 *
	 * Mirrors `superset pages pull <idOrSlug> --version <n>`.
	 */
	pull(
		idOrSlug: string,
		params?: PagePullParams | null,
		options?: RequestOptions,
	): APIPromise<PagePullResult> {
		return this._client.query<PagePullResult>(
			{ method: "pages.pull", procedure: "page.pull" },
			{
				...pageRef(idOrSlug),
				...(params?.version ? { version: params.version } : {}),
			},
			options,
		);
	}

	/**
	 * Publish an HTML document as a new page version and get its public URL.
	 * Pass `pageId` to add a version to an existing page; otherwise pass
	 * `workspaceId` and `entryPath`, which together key the page so a later
	 * publish with the same pair versions it instead of minting a second one.
	 *
	 * Mirrors `superset pages publish <file.html>` (single-file publish; the
	 * CLI additionally stages a directory's assets).
	 */
	publish(
		params: PagePublishParams,
		options?: RequestOptions,
	): APIPromise<PagePublishResult> {
		const hasWorkspace = Boolean(params.workspaceId);
		const hasEntryPath = Boolean(params.entryPath);
		if (!params.pageId && hasWorkspace !== hasEntryPath) {
			throw new SupersetError(
				"workspaceId and entryPath must be provided together",
			);
		}
		if (!params.pageId && !hasWorkspace) {
			throw new SupersetError(
				"A publish must name where it lives: pass workspaceId and entryPath, or pageId to add a version to an existing page",
			);
		}
		return this._client.mutation<PagePublishResult>(
			{ method: "pages.publish", procedure: "page.publish" },
			{
				content: base64Utf8(params.html),
				contentType: "text/html",
				filename: params.filename ?? "page.html",
				...(params.pageId
					? { pageId: params.pageId }
					: { workspaceId: params.workspaceId, entryPath: params.entryPath }),
				...(params.title ? { title: params.title } : {}),
				...(params.description ? { description: params.description } : {}),
				...(params.label ? { label: params.label } : {}),
				...(params.visibility ? { visibility: params.visibility } : {}),
			},
			options,
		);
	}
}

export type PageVisibility = "just_me" | "org";

/** Page row as returned by `list`, with the latest version folded in. */
export interface PageSummary {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	visibility: PageVisibility;
	/** Pinned version served to readers; null means the latest. */
	sharedVersion: number | null;
	createdAt: string;
	updatedAt: string;
	createdByUserId: string | null;
	ownerName: string | null;
	/** Null for a page with no versions yet. */
	latestVersion: number | null;
	contentType: string | null;
	sizeBytes: number | null;
	publishedAt: string | null;
	/** Public URL of the page. */
	url: string;
	/** Ticketed URL that renders the served version. */
	viewUrl: string;
	thumbnailUrl: string | null;
}

export type PageListResponse = Array<PageSummary>;

export interface PageListParams {
	/** Only pages published from this workspace. */
	workspaceId?: string;
}

export interface PageWatchState {
	watching: boolean;
	agentId: string | null;
}

/** Page as returned by `retrieve`. */
export interface Page {
	id: string;
	slug: string;
	organizationId: string;
	createdByUserId: string | null;
	title: string;
	description: string | null;
	visibility: PageVisibility;
	/** Pinned version served to readers; null means the latest. */
	sharedVersion: number | null;
	createdAt: string;
	updatedAt: string;
	/** Public URL of the page. */
	url: string;
	/** Ticketed URL that renders the served version. */
	viewUrl: string;
	latestVersion: number | null;
	servedVersion: number | null;
	watch: PageWatchState;
}

export interface PageVersion {
	version: number;
	label: string | null;
	contentType: string;
	sizeBytes: number;
	sha256: string;
	createdAt: string;
	createdByUserId: string | null;
}

export type PageVersionListResponse = Array<PageVersion>;

export interface PagePullParams {
	/** Version to fetch; defaults to the one currently served. */
	version?: number;
}

export interface PagePullResult extends PageVersion {
	id: string;
	slug: string;
	url: string;
	title: string;
	description: string | null;
	visibility: PageVisibility;
	createdByUserId: string | null;
	updatedAt: string;
	sharedVersion: number | null;
	latestVersion: number | null;
	servedVersion: number | null;
	watch: PageWatchState;
	/** Short-lived URL that serves this version's HTML. */
	downloadUrl: string;
	/** Ticketed URL that renders this version. */
	viewUrl: string;
}

export interface PagePublishParams {
	/** The complete, self-contained HTML document. */
	html: string;
	/** Filename recorded for this version, e.g. `report.html`. Defaults to `page.html`. */
	filename?: string;
	/** Publish a new version of this existing page. */
	pageId?: string;
	/** Workspace the page belongs to. Required with `entryPath` unless `pageId` is set. */
	workspaceId?: string;
	/** Where the page lives in the workspace, relative to its root, e.g. `reports/q3.html`. */
	entryPath?: string;
	/** Page title. Defaults to the filename. */
	title?: string;
	/** Short description shown alongside the page. */
	description?: string;
	/** What changed in this version, shown in the version history. */
	label?: string;
	/** `org` (the default for new pages) or `just_me`. */
	visibility?: PageVisibility;
}

export interface PagePublishResult {
	id: string;
	slug: string;
	/** Public URL of the page. */
	url: string;
	title: string;
	description: string | null;
	visibility: PageVisibility;
	version: number;
	label: string | null;
	contentType: string;
	sizeBytes: number;
	createdAt: string;
}

export interface PageCommentListParams {
	/** Page UUID (resolve a slug with `pages.retrieve` first). */
	pageId: string;
	/** Only threads a person has sent to an agent. */
	activatedOnly?: boolean;
}

export interface PageCommentAnchor {
	path: string;
	tag: string;
	offsetX?: number;
	offsetY?: number;
}

export interface PageComment {
	id: string;
	body: string;
	authorKind: "human" | "agent";
	authorName: string;
	authorImage: string | null;
	createdAt: string;
}

export interface PageCommentThread {
	id: string;
	anchorKind: "element" | "page";
	anchor: PageCommentAnchor | null;
	anchorText: string | null;
	resolved: boolean;
	createdAt: string;
	/** Page version the thread was opened on. */
	version: number;
	comments: PageComment[];
}

export type PageCommentListResponse = Array<PageCommentThread>;

export interface PageCommentReplyParams {
	threadId: string;
	body: string;
	/** Names the agent session replying, for readers; descriptive only. */
	agentSessionId?: string;
}

export interface PageCommentReplyResult {
	id: string | undefined;
}

export interface PageCommentResolveParams {
	threadId: string;
	/** Default true. Pass false to reopen the thread. */
	resolved?: boolean;
}

export interface PageCommentResolveResult {
	id: string;
	resolved: boolean;
}

export declare namespace Pages {
	export type {
		Page,
		PageSummary,
		PageVisibility,
		PageWatchState,
		PageListParams,
		PageListResponse,
		PageVersion,
		PageVersionListResponse,
		PagePullParams,
		PagePullResult,
		PagePublishParams,
		PagePublishResult,
		PageComment,
		PageCommentAnchor,
		PageCommentThread,
		PageCommentListParams,
		PageCommentListResponse,
		PageCommentReplyParams,
		PageCommentReplyResult,
		PageCommentResolveParams,
		PageCommentResolveResult,
	};
}
