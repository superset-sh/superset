import { EventEmitter } from "node:events";

// Wraps native-keymap for the renderer (mirrors VSCode's
// keyboardLayoutMainService). Lazy-loads on first read so the native module
// only initializes when actually needed. On macOS, native-keymap hooks
// Apple's kTISNotifySelectedKeyboardInputSourceChanged distributed
// notification — input-source switches fire onChange within milliseconds,
// which navigator.keyboard.layoutchange does not do in Chromium.

export interface KeyboardLayoutData {
	/** OS-specific layout id, e.g. "com.apple.keylayout.German". Empty if unavailable. */
	layoutId: string;
	/** Localized human-readable name, e.g. "German". Empty if unavailable. */
	layoutName: string;
	/** Map<event.code, unshifted glyph>. Phase 2 may extend with shifted/altgr layers. */
	unshifted: Record<string, string>;
}

const EMPTY: KeyboardLayoutData = {
	layoutId: "",
	layoutName: "",
	unshifted: {},
};

const emitter = new EventEmitter();
let cached: KeyboardLayoutData = EMPTY;
let initialized = false;

type NativeKeymapModule = typeof import("native-keymap");

let nativeKeymap: NativeKeymapModule | null = null;

function loadNative(): NativeKeymapModule | null {
	if (nativeKeymap) return nativeKeymap;
	try {
		nativeKeymap = require("native-keymap") as NativeKeymapModule;
		return nativeKeymap;
	} catch (err) {
		console.error("[keyboardLayout] failed to load native-keymap:", err);
		return null;
	}
}

function read(): KeyboardLayoutData {
	const mod = loadNative();
	if (!mod) return EMPTY;
	try {
		const info = mod.getCurrentKeyboardLayout() as {
			id?: string;
			name?: string;
			localizedName?: string;
			lang?: string;
		} | null;
		const map = mod.getKeyMap() as Record<string, { value?: string }>;
		const unshifted: Record<string, string> = {};
		for (const [code, entry] of Object.entries(map)) {
			if (entry?.value) unshifted[code] = entry.value;
		}
		return {
			layoutId: info?.id ?? info?.name ?? "",
			layoutName: info?.localizedName ?? info?.name ?? "",
			unshifted,
		};
	} catch (err) {
		console.error("[keyboardLayout] read failed:", err);
		return EMPTY;
	}
}

function ensureInitialized(): void {
	if (initialized) return;
	initialized = true;
	const mod = loadNative();
	if (!mod) return;
	cached = read();
	try {
		mod.onDidChangeKeyboardLayout(() => {
			cached = read();
			emitter.emit("change", cached);
		});
	} catch (err) {
		console.error("[keyboardLayout] failed to register listener:", err);
	}
}

/** Current layout snapshot. Initializes native-keymap on first call. */
export function getKeyboardLayoutSnapshot(): KeyboardLayoutData {
	ensureInitialized();
	return cached;
}

/** Subscribe to layout changes. Returns an unsubscribe function. */
export function onKeyboardLayoutChange(
	cb: (data: KeyboardLayoutData) => void,
): () => void {
	ensureInitialized();
	emitter.on("change", cb);
	return () => {
		emitter.off("change", cb);
	};
}
