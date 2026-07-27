import { useCallback, useEffect, useRef, useState } from "react";
import {
	Keyboard,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	Conversation,
	type ConversationController,
} from "@/components/ai-elements/conversation";
import { Text } from "@/components/ui/text";

/**
 * Hidden scroll-regression lab (deep link: superset://debug/conversation-lab).
 *
 * Mounts the real Conversation component on synthetic data and runs scripted
 * interaction scenarios that assert the scroll invariants we ship by
 * (AGENTS.md next to conversation.tsx). Each scenario self-asserts and
 * reports `PASS` / `FAIL(reason)`; the Maestro flow
 * (.maestro/conversation-lab.yaml) taps "run all" and asserts every PASS —
 * a simplification that breaks an invariant fails visibly instead of
 * shipping.
 */

const ANCHOR_OFFSET_TOP = 8;
const CONTENT_PADDING_BOTTOM = 16;
const OVERLAY_HEIGHT = 280;
/** At-end tolerance: layout rounding plus the sub-point scroll jitter iOS
 * reports while settling. */
const AT_END_EPSILON = 3;
const ANCHOR_EPSILON = 4;

interface LabItem {
	id: string;
	role: "assistant" | "user";
	text: string;
}

const WORDS =
	"the scroll view only ever moves when the reader asked it to and every other event converts into trailing whitespace instead".split(
		" ",
	);

/** Deterministic filler paragraph — item heights vary but never randomly. */
function paragraph(seed: number, sentences: number): string {
	const parts: string[] = [];
	for (let s = 0; s < sentences; s += 1) {
		const length = 6 + ((seed * 7 + s * 11) % 13);
		const words: string[] = [];
		for (let w = 0; w < length; w += 1) {
			words.push(WORDS[(seed + s * 5 + w) % WORDS.length]);
		}
		parts.push(words.join(" "));
	}
	return parts.join(". ");
}

function initialItems(): LabItem[] {
	const items: LabItem[] = [];
	for (let i = 0; i < 60; i += 1) {
		items.push({
			id: `seed-${i}`,
			role: i % 4 === 0 ? "user" : "assistant",
			text: `#${i} ${paragraph(i, 1 + (i % 4))}`,
		});
	}
	return items;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

type Measured = { x: number; y: number; width: number; height: number };

function measureInWindow(view: View): Promise<Measured> {
	return new Promise((resolve) => {
		view.measureInWindow((x, y, width, height) =>
			resolve({ x, y, width, height }),
		);
	});
}

type ScenarioKey =
	| "followPin"
	| "noMoveUnpinned"
	| "overlayResolve"
	| "keyboardPinned"
	| "keyboardUnpinned"
	| "sendAnchor"
	| "sendAnchorFromHistory";

const SCENARIOS: ScenarioKey[] = [
	"followPin",
	"noMoveUnpinned",
	"overlayResolve",
	"keyboardPinned",
	"keyboardUnpinned",
	"sendAnchor",
	"sendAnchorFromHistory",
];

export function ConversationLabScreen() {
	const controllerRef = useRef<ConversationController>(null);
	const listBoxRef = useRef<View>(null);
	const inputRef = useRef<TextInput>(null);
	const rowRefs = useRef(new Map<string, View>());
	const [items, setItems] = useState<LabItem[]>(initialItems);
	const itemsRef = useRef(items);
	itemsRef.current = items;
	const [overlayVisible, setOverlayVisible] = useState(false);
	const [results, setResults] = useState<Partial<Record<ScenarioKey, string>>>(
		{},
	);
	const [runState, setRunState] = useState<"done" | "idle" | "running">("idle");
	const counterRef = useRef(0);

	const appendChunk = useCallback((sentences: number) => {
		counterRef.current += 1;
		const id = counterRef.current;
		setItems((previous) => [
			...previous,
			{
				id: `chunk-${id}`,
				role: "assistant",
				text: paragraph(id, sentences),
			},
		]);
	}, []);

	const appendUserMessage = useCallback((): string => {
		counterRef.current += 1;
		const id = `sent-${counterRef.current}`;
		setItems((previous) => [
			...previous,
			{ id, role: "user", text: `anchored message ${counterRef.current}` },
		]);
		return id;
	}, []);

	const state = useCallback(() => {
		const controller = controllerRef.current;
		if (controller === null) throw new Error("controller not mounted");
		return controller.getScrollState();
	}, []);

	/** Distance from the viewport bottom edge to the true end of content. */
	const scrollToRawEnd = useCallback(async () => {
		const controller = controllerRef.current;
		if (controller === null) throw new Error("controller not mounted");
		const s = state();
		controller.scrollTo(Math.max(0, s.rawContentH - s.viewportH), false);
		await wait(120);
	}, [state]);

	// --- scenarios ----------------------------------------------------------

	/** Pinned at the bottom, streaming content: the view follows the true end
	 * on every chunk. */
	const runFollowPin = useCallback(async (): Promise<string> => {
		const controller = controllerRef.current;
		if (controller === null) return "FAIL(no controller)";
		await scrollToRawEnd();
		controller.setPinned(true);
		await wait(150);
		for (let i = 0; i < 4; i += 1) {
			appendChunk(1 + (i % 3));
			await wait(280);
			const s = state();
			const endOffset = Math.max(0, s.rawContentH - s.viewportH);
			if (Math.abs(s.offset - endOffset) > AT_END_EPSILON) {
				return `FAIL(chunk ${i}: offset ${s.offset.toFixed(1)} != end ${endOffset.toFixed(1)})`;
			}
			if (!s.pinned) return `FAIL(chunk ${i}: lost pin)`;
		}
		return "PASS";
	}, [appendChunk, scrollToRawEnd, state]);

	/** Reader parked mid-history: streaming below (including a transient
	 * content dip) must not move the view by a single point. */
	const runNoMoveUnpinned = useCallback(async (): Promise<string> => {
		const controller = controllerRef.current;
		if (controller === null) return "FAIL(no controller)";
		controller.setPinned(false);
		const s0 = state();
		controller.scrollTo(
			Math.max(0, (s0.rawContentH - s0.viewportH) * 0.5),
			false,
		);
		await wait(200);
		const before = state().offset;
		for (let i = 0; i < 3; i += 1) {
			appendChunk(2);
			await wait(220);
		}
		// Transient dip: remove the last chunk, then put it back — streaming
		// re-measurement shrinks content like this all the time.
		setItems((previous) => previous.slice(0, -1));
		await wait(220);
		appendChunk(2);
		await wait(220);
		const after = state().offset;
		if (Math.abs(after - before) > 1) {
			return `FAIL(moved ${before.toFixed(1)} -> ${after.toFixed(1)})`;
		}
		return "PASS";
	}, [appendChunk, state]);

	/** A bottom overlay (permission stack stand-in) appearing and resolving
	 * must not move an unpinned reader parked near the end. */
	const runOverlayResolve = useCallback(async (): Promise<string> => {
		const controller = controllerRef.current;
		if (controller === null) return "FAIL(no controller)";
		controller.setPinned(false);
		await scrollToRawEnd();
		// A content event banks the trailing slack for the current position.
		appendChunk(1);
		await wait(250);
		const before = state().offset;
		setOverlayVisible(true);
		await wait(350);
		const shown = state().offset;
		if (Math.abs(shown - before) > 1) {
			setOverlayVisible(false);
			return `FAIL(overlay-in moved ${before.toFixed(1)} -> ${shown.toFixed(1)})`;
		}
		setOverlayVisible(false);
		await wait(350);
		const after = state().offset;
		if (Math.abs(after - before) > 1) {
			return `FAIL(overlay-out moved ${before.toFixed(1)} -> ${after.toFixed(1)})`;
		}
		return "PASS";
	}, [appendChunk, scrollToRawEnd, state]);

	/** Focusing the composer (keyboard up, viewport shrinks through the
	 * KeyboardAvoidingView) keeps the newest content visible while pinned,
	 * and dismissing follows back down — the real send flow's bookends. */
	const runKeyboardPinned = useCallback(async (): Promise<string> => {
		const controller = controllerRef.current;
		const input = inputRef.current;
		if (controller === null || input === null) return "FAIL(no input)";
		await scrollToRawEnd();
		controller.setPinned(true);
		await wait(150);
		const viewportBefore = state().viewportH;
		input.focus();
		await wait(700);
		const shown = state();
		if (shown.viewportH >= viewportBefore) {
			input.blur();
			return "FAIL(keyboard never resized the viewport)";
		}
		const shownEnd = Math.max(0, shown.rawContentH - shown.viewportH);
		if (Math.abs(shown.offset - shownEnd) > AT_END_EPSILON) {
			input.blur();
			return `FAIL(keyboard-in: offset ${shown.offset.toFixed(1)} != end ${shownEnd.toFixed(1)})`;
		}
		input.blur();
		Keyboard.dismiss();
		await wait(700);
		const after = state();
		const afterEnd = Math.max(0, after.rawContentH - after.viewportH);
		if (Math.abs(after.offset - afterEnd) > AT_END_EPSILON) {
			return `FAIL(keyboard-out: offset ${after.offset.toFixed(1)} != end ${afterEnd.toFixed(1)})`;
		}
		return "PASS";
	}, [scrollToRawEnd, state]);

	/** The keyboard coming and going must not move an unpinned reader
	 * parked in history. */
	const runKeyboardUnpinned = useCallback(async (): Promise<string> => {
		const controller = controllerRef.current;
		const input = inputRef.current;
		if (controller === null || input === null) return "FAIL(no input)";
		controller.setPinned(false);
		const s0 = state();
		controller.scrollTo(
			Math.max(0, (s0.rawContentH - s0.viewportH) * 0.4),
			false,
		);
		await wait(200);
		const before = state().offset;
		input.focus();
		await wait(700);
		const shown = state().offset;
		if (Math.abs(shown - before) > 1) {
			input.blur();
			return `FAIL(keyboard-in moved ${before.toFixed(1)} -> ${shown.toFixed(1)})`;
		}
		input.blur();
		Keyboard.dismiss();
		await wait(700);
		const after = state().offset;
		if (Math.abs(after - before) > 1) {
			return `FAIL(keyboard-out moved ${before.toFixed(1)} -> ${after.toFixed(1)})`;
		}
		return "PASS";
	}, [state]);

	/** Sending a message anchors it below the top edge with whitespace
	 * beneath — asserted on the actual on-screen position of the bubble. */
	const runSendAnchor = useCallback(
		async (fromHistory: boolean): Promise<string> => {
			const controller = controllerRef.current;
			const listBox = listBoxRef.current;
			if (controller === null || listBox === null) {
				return "FAIL(no controller)";
			}
			controller.setPinned(false);
			if (fromHistory) {
				controller.scrollTo(0, false);
			} else {
				await scrollToRawEnd();
			}
			await wait(250);
			const id = appendUserMessage();
			const index = itemsRef.current.length; // the item lands at this index
			await wait(60);
			controller.scrollToAnchor(index);
			// First leg + up to two corrective legs.
			await wait(3200);
			const row = rowRefs.current.get(id);
			if (row === undefined) return "FAIL(anchored row not mounted)";
			const rowBox = await measureInWindow(row);
			const box = await measureInWindow(listBox);
			const delta = rowBox.y - box.y - ANCHOR_OFFSET_TOP;
			if (Math.abs(delta) > ANCHOR_EPSILON) {
				return `FAIL(bubble ${delta.toFixed(1)}pt off the anchor line)`;
			}
			return "PASS";
		},
		[appendUserMessage, scrollToRawEnd],
	);

	const running = useRef(false);
	const runAll = useCallback(async () => {
		if (running.current) return;
		running.current = true;
		setRunState("running");
		setResults({});
		const table: Record<ScenarioKey, () => Promise<string>> = {
			followPin: runFollowPin,
			keyboardPinned: runKeyboardPinned,
			keyboardUnpinned: runKeyboardUnpinned,
			noMoveUnpinned: runNoMoveUnpinned,
			overlayResolve: runOverlayResolve,
			sendAnchor: () => runSendAnchor(false),
			sendAnchorFromHistory: () => runSendAnchor(true),
		};
		for (const key of SCENARIOS) {
			let outcome: string;
			try {
				outcome = await table[key]();
			} catch (cause) {
				outcome = `FAIL(${cause instanceof Error ? cause.message : String(cause)})`;
			}
			setResults((previous) => ({ ...previous, [key]: outcome }));
			await wait(200);
		}
		setRunState("done");
		running.current = false;
	}, [
		runFollowPin,
		runKeyboardPinned,
		runKeyboardUnpinned,
		runNoMoveUnpinned,
		runOverlayResolve,
		runSendAnchor,
	]);

	// Rows unmount as data changes; drop stale refs so measures can't hit
	// detached nodes.
	useEffect(() => {
		const alive = new Set(items.map((item) => item.id));
		for (const key of rowRefs.current.keys()) {
			if (!alive.has(key)) rowRefs.current.delete(key);
		}
	}, [items]);

	const insets = useSafeAreaInsets();

	return (
		// Same keyboard geometry as SessionThread: the scroll view shrinks
		// when the composer focuses, exercising the real viewport branches.
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : undefined}
			className="bg-background flex-1"
			keyboardVerticalOffset={0}
			style={{ paddingTop: insets.top }}
		>
			<View className="gap-1 border-border border-b px-3 py-2">
				<Pressable
					accessibilityLabel="lab-run-all"
					className="bg-primary items-center rounded-md py-2"
					onPress={() => void runAll()}
				>
					<Text className="text-primary-foreground font-medium text-sm">
						run all scenarios
					</Text>
				</Pressable>
				<Text className="font-mono text-muted-foreground text-xs">
					{`state: ${runState}`}
				</Text>
				{SCENARIOS.map((key) => (
					<Text className="font-mono text-xs" key={key}>
						{`${key}: ${results[key] ?? "—"}`}
					</Text>
				))}
			</View>
			<View className="flex-1" collapsable={false} ref={listBoxRef}>
				<Conversation
					data={items}
					keyExtractor={(item) => item.id}
					anchorOffsetTop={ANCHOR_OFFSET_TOP}
					contentPaddingBottom={CONTENT_PADDING_BOTTOM}
					controllerRef={controllerRef}
					contentContainerStyle={{
						paddingBottom: CONTENT_PADDING_BOTTOM,
						paddingHorizontal: 12,
						paddingTop: 8,
					}}
					renderItem={({ item }) => (
						<View
							collapsable={false}
							ref={(node) => {
								if (node !== null) rowRefs.current.set(item.id, node);
							}}
							className={
								item.role === "user"
									? "bg-secondary ml-12 mb-2 rounded-xl px-3 py-2"
									: "mb-2 px-1"
							}
						>
							<Text className="text-sm">{item.text}</Text>
						</View>
					)}
				/>
			</View>
			{overlayVisible ? (
				<View
					className="border-border bg-card border-t px-4 py-3"
					style={{ height: OVERLAY_HEIGHT }}
				>
					<Text className="text-sm">overlay (permission stack stand-in)</Text>
				</View>
			) : null}
			<View className="border-border border-t px-3 py-2">
				<TextInput
					accessibilityLabel="lab-input"
					className="text-foreground rounded-md border border-border px-3 py-2 text-sm"
					placeholder="composer stand-in"
					ref={inputRef}
				/>
			</View>
		</KeyboardAvoidingView>
	);
}
