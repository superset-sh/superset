import { Textarea } from "@superset/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiCheckCircle } from "react-icons/hi2";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface SparseCheckoutSectionProps {
	projectId: string;
	hostUrl: string;
	/** Current folders; empty means new worktrees get a full checkout. */
	paths: string[];
	onChanged: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error" | "invalid";

const SAVE_DEBOUNCE_MS = 500;
const SAVED_INDICATOR_MS = 2000;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30000;

function toLines(paths: string[]): string {
	return paths.join("\n");
}

function toPaths(value: string): string[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function pathsEqual(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((path, i) => path === b[i]);
}

export function SparseCheckoutSection({
	projectId,
	hostUrl,
	paths,
	onChanged,
}: SparseCheckoutSectionProps) {
	const [value, setValue] = useState(() => toLines(paths));
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const [invalidMessage, setInvalidMessage] = useState<string | null>(null);

	// Asking the DOM beats tracking focus in a ref: a ref set on focus and
	// cleared on blur stays stuck at `true` if the field is unmounted or
	// navigated away from while focused, which permanently wedges the re-seed
	// guard below.
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const isFocused = useCallback(
		() =>
			!!textareaRef.current && document.activeElement === textareaRef.current,
		[],
	);
	const latestValueRef = useRef(value);
	const lastSavedRef = useRef<string[]>(paths);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const saveInFlightRef = useRef(false);
	const queuedPathsRef = useRef<string[] | null>(null);
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const retryDelayRef = useRef(RETRY_BASE_MS);
	// Lets the failure path re-enter the save without a circular useCallback.
	const flushSaveRef = useRef<((next: string[]) => Promise<void>) | null>(null);

	const savedLines = toLines(paths);
	useEffect(() => {
		// Don't clobber an in-progress edit when the host row refetches.
		if (isFocused() || debounceTimerRef.current || saveInFlightRef.current) {
			return;
		}
		setValue(savedLines);
		latestValueRef.current = savedLines;
		lastSavedRef.current = toPaths(savedLines);
	}, [savedLines, isFocused]);

	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
			if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
			// Without this a failed save keeps retrying after the editor is gone.
			if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
		};
	}, []);

	const saveMutation = useMutation({
		mutationFn: (nextPaths: string[]) =>
			getHostServiceClientByUrl(hostUrl).project.setSparseCheckoutPaths.mutate({
				projectId,
				paths: nextPaths,
			}),
	});

	const flushSave = useCallback(
		async (next: string[]) => {
			if (pathsEqual(next, lastSavedRef.current)) {
				// The user backed the text out to exactly what's already saved
				// (e.g. undoing a rejected edit) — nothing to send, but a stale
				// "invalid"/"error" status from the edit they just undid would
				// otherwise sit on screen forever since nothing else clears it.
				// Skip this while a save is in flight: that request is for some
				// other (still pending) value, and its own completion already
				// owns the status transition.
				if (!saveInFlightRef.current) {
					setSaveStatus("idle");
					setInvalidMessage(null);
					if (retryTimerRef.current) {
						clearTimeout(retryTimerRef.current);
						retryTimerRef.current = null;
					}
					queuedPathsRef.current = null;
				}
				return;
			}

			// Coalesce rather than race: a save landing out of order would
			// resurrect folders the user already removed.
			if (saveInFlightRef.current) {
				queuedPathsRef.current = next;
				return;
			}

			if (savedTimerRef.current) {
				clearTimeout(savedTimerRef.current);
				savedTimerRef.current = null;
			}

			setSaveStatus("saving");
			setInvalidMessage(null);
			saveInFlightRef.current = true;
			try {
				let pathsToSave: string[] | null = next;
				while (pathsToSave) {
					queuedPathsRef.current = null;
					if (!pathsEqual(pathsToSave, lastSavedRef.current)) {
						await saveMutation.mutateAsync(pathsToSave);
						lastSavedRef.current = pathsToSave;
					}
					pathsToSave = queuedPathsRef.current;
				}

				retryDelayRef.current = RETRY_BASE_MS;
				setSaveStatus("saved");
				savedTimerRef.current = setTimeout(() => {
					setSaveStatus("idle");
					savedTimerRef.current = null;
				}, SAVED_INDICATOR_MS);
				onChanged();
			} catch (err) {
				// A BAD_REQUEST means the folders themselves are invalid (traversal,
				// a leading "-", too many entries) — retrying sends the exact same
				// request and fails the exact same way, forever, until the user
				// edits the text. Surface why instead of spinning silently.
				if (
					err instanceof TRPCClientError &&
					err.data?.code === "BAD_REQUEST"
				) {
					setSaveStatus("invalid");
					setInvalidMessage(err.message);
					console.warn("[sparse-checkout/save] rejected, not retrying", err);
					return;
				}

				// The debounce that scheduled this save is already spent, and the
				// loop nulls the queue before each attempt — so without putting the
				// pending edit back, whatever the user last typed is silently lost.
				queuedPathsRef.current =
					queuedPathsRef.current ?? toPaths(latestValueRef.current);
				setSaveStatus("error");
				console.warn("[sparse-checkout/save] failed, retrying", err);

				const delay = retryDelayRef.current;
				retryDelayRef.current = Math.min(delay * 2, RETRY_MAX_MS);
				if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
				retryTimerRef.current = setTimeout(() => {
					retryTimerRef.current = null;
					const pending = queuedPathsRef.current;
					queuedPathsRef.current = null;
					if (pending) void flushSaveRef.current?.(pending);
				}, delay);
			} finally {
				saveInFlightRef.current = false;
			}
		},
		[onChanged, saveMutation],
	);
	flushSaveRef.current = flushSave;

	const handleChange = useCallback(
		(nextValue: string) => {
			setValue(nextValue);
			latestValueRef.current = nextValue;

			if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = setTimeout(() => {
				debounceTimerRef.current = null;
				void flushSave(toPaths(latestValueRef.current));
			}, SAVE_DEBOUNCE_MS);
		},
		[flushSave],
	);

	const handleBlur = useCallback(() => {
		// Commit immediately on the way out instead of leaving the last
		// keystrokes sitting in the debounce window.
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = null;
		}
		void flushSave(toPaths(latestValueRef.current));
	}, [flushSave]);

	return (
		<div className="space-y-1.5">
			<Textarea
				ref={textareaRef}
				id="project-sparse-checkout"
				value={value}
				onChange={(e) => handleChange(e.target.value)}
				onBlur={handleBlur}
				placeholder={"apps/desktop\npackages/ui"}
				rows={3}
				spellCheck={false}
				// Grows with the folder list via the base Textarea's
				// field-sizing-content, same as the Scripts editor. That mode
				// ignores `rows`, so the three-line floor has to be a min-height:
				// three line-boxes plus the py-2 padding and the 1px borders.
				className="font-mono text-sm resize-y min-h-[calc(3lh+1.125rem)]"
			/>
			<div className="flex h-4 items-center justify-end text-xs text-muted-foreground">
				{saveStatus === "saving" && <span>Saving…</span>}
				{saveStatus === "saved" && (
					<span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
						<HiCheckCircle className="h-3.5 w-3.5" />
						Saved
					</span>
				)}
				{saveStatus === "error" && (
					// Shown inline rather than as a toast: the retry loop would
					// otherwise fire one toast per attempt. Selectable per the
					// renderer's body-level user-select: none.
					<span className="select-text cursor-text text-destructive">
						Couldn't save — retrying…
					</span>
				)}
				{saveStatus === "invalid" && (
					// Not retried: the server rejected the folders themselves, so
					// retrying would fail identically forever. Show why instead.
					<span className="select-text cursor-text text-destructive">
						{invalidMessage ?? "Couldn't save"}
					</span>
				)}
			</div>
		</div>
	);
}
