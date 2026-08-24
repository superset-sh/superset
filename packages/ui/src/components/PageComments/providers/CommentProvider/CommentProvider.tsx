"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import type { CommentAnchor, FrameRect } from "../../utils/commentRuntime";

export interface PageCommentUser {
	id: string;
	name: string;
	image: string | null;
}

export interface PageComment {
	id: string;
	authorName: string;
	authorImage: string | null;
	body: string;
	createdAt: number;
}

export interface CommentThread {
	id: string;
	anchor: CommentAnchor;
	comments: PageComment[];
	resolved: boolean;
}

export interface CommentDraft {
	anchor: CommentAnchor;
	rect: FrameRect;
}

export interface CommentStore {
	threads: CommentThread[];
	isLoading: boolean;
	createThread: (input: {
		anchor: CommentAnchor;
		anchorText: string;
		body: string;
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
	submitting: boolean;
	busyThreadId: string | null;
	framePointerDownAt: number;
	notifyFramePointerDown: () => void;
	enabled: boolean;
	toggleEnabled: () => void;
	draft: CommentDraft | null;
	openDraft: (draft: CommentDraft) => void;
	discardDraft: () => void;
	activeThreadId: string | null;
	setActiveThreadId: (id: string | null) => void;
	hoverRect: FrameRect | null;
	setHoverRect: (rect: FrameRect | null) => void;
	rects: Record<string, FrameRect | null>;
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

export function CommentProvider({
	user,
	store,
	children,
}: {
	user: PageCommentUser;
	store: CommentStore;
	children: ReactNode;
}) {
	const [enabled, setEnabled] = useState(false);
	const [draft, setDraft] = useState<CommentDraft | null>(null);
	const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
	const [hoverRect, setHoverRect] = useState<FrameRect | null>(null);
	const [rects, setRectState] = useState<Record<string, FrameRect | null>>({});
	const [submitting, setSubmitting] = useState(false);
	const [busyThreadId, setBusyThreadId] = useState<string | null>(null);
	const [framePointerDownAt, setFramePointerDownAt] = useState(0);
	const submittingRef = useRef(false);

	const toggleEnabled = useCallback(() => {
		setEnabled((previous) => {
			if (previous) {
				setDraft(null);
				setActiveThreadId(null);
				setHoverRect(null);
			}
			return !previous;
		});
	}, []);

	const openDraft = useCallback((next: CommentDraft) => {
		setActiveThreadId(null);
		setDraft(next);
	}, []);

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
			setRectState(Object.fromEntries(entries.map((e) => [e.id, e.rect])));
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
			const ok = await runSubmit(() => store.createThread(input));
			if (ok) setDraft(null);
		},
		[runSubmit, store],
	);

	const addReply = useCallback<CommentStore["addReply"]>(
		async (threadId, body) => {
			await runSubmit(() => store.addReply(threadId, body));
		},
		[runSubmit, store],
	);

	const editComment = useCallback<CommentStore["editComment"]>(
		async (threadId, commentId, body) => {
			await runSubmit(() => store.editComment(threadId, commentId, body));
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
		(threadId, resolved) =>
			runThreadAction(threadId, () => store.setResolved(threadId, resolved)),
		[runThreadAction, store],
	);

	const deleteThread = useCallback<CommentStore["deleteThread"]>(
		(threadId) => runThreadAction(threadId, () => store.deleteThread(threadId)),
		[runThreadAction, store],
	);

	const value = useMemo<CommentContextValue>(
		() => ({
			user,
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
			draft,
			openDraft,
			discardDraft,
			activeThreadId,
			setActiveThreadId,
			hoverRect,
			setHoverRect,
			rects,
			setRects,
		}),
		[
			user,
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
			draft,
			openDraft,
			discardDraft,
			activeThreadId,
			hoverRect,
			rects,
			setRects,
		],
	);

	return (
		<CommentContext.Provider value={value}>{children}</CommentContext.Provider>
	);
}
