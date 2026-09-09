import { Trans } from "@lingui/react/macro";
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
	// Stops a request that resolves after unmount from scheduling further
	// work (a retry, a drained queue) that nothing is left to clean up.
	const isMountedRef = useRef(true);

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
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
			if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
			// Clears an already-scheduled retry. A request still in flight at
			// unmount can't be cancelled this way — isMountedRef is what stops
			// *its* completion from scheduling a new one (see flushSave).
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
			// Always remember the latest intent while a request is in flight —
			// even a revert back to the last-saved value. That in-flight request
			// is for a snapshot from before this call; only the `finally` below,
			// once it's free, can decide there's truly nothing left to do.
			if (saveInFlightRef.current) {
				queuedPathsRef.current = next;
				return;
			}

			if (pathsEqual(next, lastSavedRef.current)) {
				// Nothing to send, and nothing in flight — but a stale
				// "invalid"/"error" status from an edit the user just undid
				// needs to clear too, or it lingers with nothing left to clear it.
				setSaveStatus("idle");
				setInvalidMessage(null);
				if (retryTimerRef.current) {
					clearTimeout(retryTimerRef.current);
					retryTimerRef.current = null;
				}
				queuedPathsRef.current = null;
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
				await saveMutation.mutateAsync(next);
				lastSavedRef.current = next;
				// A project/host switch remounts this component (it's keyed on
				// both), which can unmount it while this await was pending.
				// Nothing left to show a status on, and refetching for a screen
				// the user has already left is pure waste.
				if (!isMountedRef.current) return;

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
				} else {
					setSaveStatus("error");
					console.warn("[sparse-checkout/save] failed, retrying", err);

					if (isMountedRef.current) {
						const delay = retryDelayRef.current;
						retryDelayRef.current = Math.min(delay * 2, RETRY_MAX_MS);
						if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
						retryTimerRef.current = setTimeout(() => {
							retryTimerRef.current = null;
							// Re-read the latest value rather than replaying `next`:
							// if the user edited again during the wait, that edit
							// already owns a fresh attempt (see the in-flight check
							// above) and this retry would otherwise resend stale
							// content over it.
							if (!isMountedRef.current || saveInFlightRef.current) return;
							void flushSaveRef.current?.(toPaths(latestValueRef.current));
						}, delay);
					}
				}
			} finally {
				saveInFlightRef.current = false;
				// Something newer arrived while this attempt was busy (a revert,
				// a correction after a rejection, or just more typing) — resolve
				// it now instead of leaving it stranded until the next edit/blur.
				const pending = queuedPathsRef.current;
				queuedPathsRef.current = null;
				if (pending && isMountedRef.current) {
					// This drain is about to become the authoritative attempt for
					// `pending` — a retry the catch block just scheduled above is
					// for the now-stale value that just failed. Without clearing
					// it, it can still fire later and, e.g., reset a "Saved"
					// status this drain is about to set back to idle early.
					if (retryTimerRef.current) {
						clearTimeout(retryTimerRef.current);
						retryTimerRef.current = null;
					}
					void flushSave(pending);
				}
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
				{saveStatus === "saving" && (
					<span>
						<Trans>Saving…</Trans>
					</span>
				)}
				{saveStatus === "saved" && (
					<span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
						<HiCheckCircle className="h-3.5 w-3.5" />
						<Trans>Saved</Trans>
					</span>
				)}
				{saveStatus === "error" && (
					// Shown inline rather than as a toast: the retry loop would
					// otherwise fire one toast per attempt. Selectable per the
					// renderer's body-level user-select: none.
					<span className="select-text cursor-text text-destructive">
						<Trans>Couldn't save — retrying…</Trans>
					</span>
				)}
				{saveStatus === "invalid" && (
					// Not retried: the server rejected the folders themselves, so
					// retrying would fail identically forever. Show why instead.
					<span className="select-text cursor-text text-destructive">
						{invalidMessage ?? <Trans>Couldn't save</Trans>}
					</span>
				)}
			</div>
		</div>
	);
}
