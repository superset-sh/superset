"use client";

import type {
	CommentAnchor,
	FrameRect,
} from "@superset/shared/page-comments-runtime";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { isOptimisticId } from "../../utils/optimisticId";

export interface PageCommentUser {
	id: string;
	name: string;
	image: string | null;
}

export interface PageComment {
	id: string;
	authorName: string;
	authorImage: string | null;
	authorKind: "human" | "agent";
	authorUserId: string | null;
	body: string;
	createdAt: number;
}

export type CommentIntent = "delete" | "approve";

export interface CommentThread {
	id: string;
	anchor: CommentAnchor;
	intent?: CommentIntent | null;
	comments: PageComment[];
	resolved: boolean;
	version: number;
	createdByUserId: string | null;
}

export interface CommentDraft {
	anchor: CommentAnchor;
	rect: FrameRect;
	body?: string;
}

export interface CommentStore {
	threads: CommentThread[];
	isLoading: boolean;
	createThread: (input: {
		anchor: CommentAnchor;
		anchorText: string;
		body: string;
		intent?: CommentIntent | null;
	}) => Promise<void>;
	addReply: (threadId: string, body: string) => Promise<void>;
	editComment: (
		threadId: string,
		commentId: string,
		body: string,
	) => Promise<void>;
	setResolved: (threadId: string, resolved: boolean) => Promise<void>;
	deleteThread: (threadId: string) => Promise<void>;
}

interface CommentContextValue extends CommentStore {
	user: PageCommentUser;
	canEdit: (comment: PageComment) => boolean;
	canDeleteThread: (thread: CommentThread) => boolean;
	submitting: boolean;
	busyThreadId: string | null;
	framePointerDownAt: number;
	notifyFramePointerDown: () => void;
	enabled: boolean;
	toggleEnabled: () => void;
	/**
	 * Whether the thread list is showing. Separate from `enabled`, which is
	 * pin-placement mode: on a narrow viewport the list is a sheet you open to
	 * read, and reading should not arm the page for a stray tap.
	 */
	panelOpen: boolean;
	setPanelOpen: (open: boolean) => void;
	draft: CommentDraft | null;
	openDraft: (draft: CommentDraft) => void;
	discardDraft: () => void;
	/**
	 * The element the reader just picked, before they have said what they want
	 * to do with it. The toolbar hangs off this; choosing "comment" promotes it
	 * to a draft, and every other action posts a thread without one.
	 */
	selection: CommentDraft | null;
	openSelection: (selection: CommentDraft) => void;
	clearSelection: () => void;
	activeThreadId: string | null;
	setActiveThreadId: (id: string | null) => void;
	hoverRect: FrameRect | null;
	setHoverRect: (rect: FrameRect | null) => void;
	rects: Record<string, FrameRect | null>;
	rectsReady: boolean;
	setRects: (entries: { id: string; rect: FrameRect | null }[]) => void;
}

const CommentContext = createContext<CommentContextValue | null>(null);

export function useComments(): CommentContextValue {
	const value = useContext(CommentContext);
	if (!value) {
		throw new Error("useComments must be used inside CommentProvider");
	}
	return value;
}

function sameRect(
	a: FrameRect | null | undefined,
	b: FrameRect | null | undefined,
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return (
		a.top === b.top &&
		a.left === b.left &&
		a.width === b.width &&
		a.height === b.height
	);
}

export function CommentProvider({
	user,
	store,
	pageOwnerId,
	enabled: controlledEnabled,
	onEnabledChange,
	children,
}: {
	user: PageCommentUser;
	store: CommentStore;
	pageOwnerId?: string | null;
	enabled?: boolean;
	onEnabledChange?: (enabled: boolean) => void;
	children: ReactNode;
}) {
	const [uncontrolledEnabled, setUncontrolledEnabled] = useState(false);
	const enabled = controlledEnabled ?? uncontrolledEnabled;
	const setEnabled = useCallback(
		(update: (previous: boolean) => boolean) => {
			if (controlledEnabled === undefined) {
				setUncontrolledEnabled(update);
				return;
			}
			onEnabledChange?.(update(controlledEnabled));
		},
		[controlledEnabled, onEnabledChange],
	);
	const [draft, setDraft] = useState<CommentDraft | null>(null);
	const [selection, setSelection] = useState<CommentDraft | null>(null);
	const [panelOpen, setPanelOpenState] = useState(false);
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
	const [hoverRect, setHoverRect] = useState<FrameRect | null>(null);
	const [rects, setRectState] = useState<Record<string, FrameRect | null>>({});
	const [rectsReady, setRectsReady] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [busyThreadId, setBusyThreadId] = useState<string | null>(null);
	const [framePointerDownAt, setFramePointerDownAt] = useState(0);
	const submittingRef = useRef(false);

	const toggleEnabled = useCallback(() => {
		setEnabled((previous) => {
			if (previous) {
				setDraft(null);
				setSelection(null);
				setActiveThreadId(null);
				setHoverRect(null);
			}
			return !previous;
		});
	}, [setEnabled]);

	const setPanelOpen = useCallback((open: boolean) => {
		setPanelOpenState(open);
		if (!open) setActiveThreadId(null);
	}, []);

	const openDraft = useCallback((next: CommentDraft) => {
		setActiveThreadId(null);
		setSelection(null);
		setDraft(next);
	}, []);

	const openSelection = useCallback((next: CommentDraft) => {
		setActiveThreadId(null);
		setDraft(null);
		setSelection(next);
	}, []);

	const clearSelection = useCallback(() => setSelection(null), []);

	const notifyFramePointerDown = useCallback(
		() => setFramePointerDownAt((count) => count + 1),
		[],
	);

	const discardDraft = useCallback(() => {
		if (submittingRef.current) return;
		setDraft(null);
	}, []);

	const setRects = useCallback(
		(entries: { id: string; rect: FrameRect | null }[]) => {
			setRectState((previous) => {
				const next = Object.fromEntries(entries.map((e) => [e.id, e.rect]));
				const keys = Object.keys(next);
				if (keys.length !== Object.keys(previous).length) return next;
				return keys.every((key) => sameRect(previous[key], next[key]))
					? previous
					: next;
			});
			setRectsReady(true);
		},
		[],
	);

	const runSubmit = useCallback(async (work: () => Promise<void>) => {
		submittingRef.current = true;
		setSubmitting(true);
		try {
			await work();
			return true;
		} catch {
			return false;
		} finally {
			submittingRef.current = false;
			setSubmitting(false);
		}
	}, []);

	const createThread = useCallback<CommentStore["createThread"]>(
		async (input) => {
			const composing = draft;
			setDraft(null);
			setSelection(null);
			try {
				await store.createThread(input);
			} catch (error) {
				if (composing) setDraft({ ...composing, body: input.body });
				throw error;
			}
		},
		[draft, store],
	);

	const addReply = useCallback<CommentStore["addReply"]>(
		async (threadId, body) => {
			if (isOptimisticId(threadId)) return;
			await store.addReply(threadId, body);
		},
		[store],
	);

	const editComment = useCallback<CommentStore["editComment"]>(
		async (threadId, commentId, body) => {
			if (isOptimisticId(threadId) || isOptimisticId(commentId)) return;
			// Rethrown, unlike the thread actions: the editor holds text that is
			// only on screen, so its caller has to know the save did not land.
			const saved = await runSubmit(() =>
				store.editComment(threadId, commentId, body),
			);
			if (!saved) throw new Error("Edit failed");
		},
		[runSubmit, store],
	);

	const runThreadAction = useCallback(
		async (threadId: string, work: () => Promise<void>) => {
			setBusyThreadId(threadId);
			try {
				await work();
				setActiveThreadId(null);
			} catch {
			} finally {
				setBusyThreadId(null);
			}
		},
		[],
	);

	const setResolved = useCallback<CommentStore["setResolved"]>(
		async (threadId, resolved) => {
			if (isOptimisticId(threadId)) return;
			await runThreadAction(threadId, () =>
				store.setResolved(threadId, resolved),
			);
		},
		[runThreadAction, store],
	);

	const deleteThread = useCallback<CommentStore["deleteThread"]>(
		async (threadId) => {
			if (isOptimisticId(threadId)) return;
			await runThreadAction(threadId, () => store.deleteThread(threadId));
		},
		[runThreadAction, store],
	);

	const canEdit = useCallback(
		(comment: PageComment) =>
			comment.authorUserId !== null && comment.authorUserId === user.id,
		[user.id],
	);

	const canDeleteThread = useCallback(
		(thread: CommentThread) =>
			thread.createdByUserId === user.id ||
			(pageOwnerId !== null && pageOwnerId !== undefined
				? pageOwnerId === user.id
				: false),
		[user.id, pageOwnerId],
	);

	const value = useMemo<CommentContextValue>(
		() => ({
			user,
			canEdit,
			canDeleteThread,
			threads: store.threads,
			isLoading: store.isLoading,
			addReply,
			editComment,
			createThread,
			setResolved,
			deleteThread,
			submitting,
			busyThreadId,
			framePointerDownAt,
			notifyFramePointerDown,
			enabled,
			toggleEnabled,
			panelOpen,
			setPanelOpen,
			draft,
			openDraft,
			discardDraft,
			selection,
			openSelection,
			clearSelection,
			activeThreadId,
			setActiveThreadId,
			hoverRect,
			setHoverRect,
			rects,
			rectsReady,
			setRects,
		}),
		[
			user,
			canEdit,
			canDeleteThread,
			store.threads,
			store.isLoading,
			addReply,
			editComment,
			createThread,
			setResolved,
			deleteThread,
			submitting,
			busyThreadId,
			framePointerDownAt,
			notifyFramePointerDown,
			enabled,
			toggleEnabled,
			panelOpen,
			setPanelOpen,
			draft,
			openDraft,
			discardDraft,
			selection,
			openSelection,
			clearSelection,
			activeThreadId,
			hoverRect,
			rects,
			rectsReady,
			setRects,
		],
	);

	return (
		<CommentContext.Provider value={value}>{children}</CommentContext.Provider>
	);
}
