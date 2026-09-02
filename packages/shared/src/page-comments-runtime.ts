export interface CommentAnchor {
	path: string;
	tag: string;
	text: string;
	/**
	 * Where inside the element the reader clicked, as a fraction of its box
	 * (0..1). Fractions rather than pixels so a pin keeps its place when the
	 * page reflows at a different width. Absent on threads written before pins
	 * carried a click point; those fall back to the element's top-left corner.
	 */
	offsetX?: number;
	offsetY?: number;
}

export interface FrameRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

export const HOST_CHANNEL = "superset-comments/host";
export const FRAME_CHANNEL = "superset-comments/frame";

export type HostMessageBody =
	| { type: "set-mode"; enabled: boolean }
	| { type: "track"; anchors: { id: string; anchor: CommentAnchor }[] }
	| { type: "restore-scroll"; y: number };

export type HostMessage = HostMessageBody & { channel: typeof HOST_CHANNEL };

export type FrameMessage =
	| { channel: typeof FRAME_CHANNEL; type: "ready" }
	| { channel: typeof FRAME_CHANNEL; type: "hover"; rect: FrameRect | null }
	| { channel: typeof FRAME_CHANNEL; type: "pointer-down" }
	| { channel: typeof FRAME_CHANNEL; type: "escape" }
	| { channel: typeof FRAME_CHANNEL; type: "scroll"; y: number }
	| {
			channel: typeof FRAME_CHANNEL;
			type: "pick";
			anchor: CommentAnchor;
			rect: FrameRect;
	  }
	| {
			channel: typeof FRAME_CHANNEL;
			type: "rects";
			entries: { id: string; rect: FrameRect | null }[];
	  };

/**
 * Runs inside the served page. It is generic — it never reads page content,
 * it only measures and reports DOM elements the host asks about — and it is
 * inert until the host sends `set-mode`. The usercontent origin serves it
 * same-origin at `RUNTIME_SCRIPT_PATH` and injects one script tag per page.
 */
export const PAGE_COMMENTS_RUNTIME_SOURCE = `(() => {
	const HOST = ${JSON.stringify(HOST_CHANNEL)};
	const FRAME = ${JSON.stringify(FRAME_CHANNEL)};

	let enabled = false;
	let tracked = [];
	let lastHoverPath = null;
	let frame = 0;
	let lastScrollY = 0;
	let restoreY = null;
	let restoreDeadline = 0;

	const post = (message) => {
		parent.postMessage({ channel: FRAME, ...message }, "*");
	};

	const pathOf = (el) => {
		const parts = [];
		let node = el;
		while (node && node.nodeType === 1 && node !== document.body) {
			const parent = node.parentElement;
			if (!parent) return "";
			let index = 1;
			for (let s = node.previousElementSibling; s; s = s.previousElementSibling) {
				if (s.tagName === node.tagName) index += 1;
			}
			parts.unshift(node.tagName.toLowerCase() + ":nth-of-type(" + index + ")");
			node = parent;
		}
		return parts.join(" > ");
	};

	const resolveCache = new Map();

	const resolve = (path) => {
		if (!path) return null;
		const cached = resolveCache.get(path);
		if (cached && cached.isConnected) return cached;
		try {
			const el = document.body.querySelector(":scope > " + path);
			if (el) resolveCache.set(path, el);
			else resolveCache.delete(path);
			return el;
		} catch {
			return null;
		}
	};

	const rectOf = (el) => {
		const r = el.getBoundingClientRect();
		if (r.width === 0 && r.height === 0) return null;
		return { top: r.top, left: r.left, width: r.width, height: r.height };
	};

	const fraction = (offset, extent) => {
		if (!(extent > 0)) return 0;
		return Math.min(Math.max(offset / extent, 0), 1);
	};

	const targetAt = (x, y) => {
		const el = document.elementFromPoint(x, y);
		if (!el || el === document.body || el === document.documentElement) return null;
		return el;
	};

	const applyRestore = () => {
		if (restoreY === null) return;
		if (Date.now() > restoreDeadline) {
			restoreY = null;
			return;
		}
		scrollTo({ top: restoreY, behavior: "instant" });
	};

	const syncRects = () => {
		post({
			type: "rects",
			entries: tracked.map((t) => {
				const el = resolve(t.anchor.path);
				return { id: t.id, rect: el ? rectOf(el) : null };
			}),
		});
	};

	const schedule = () => {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			syncRects();
			if (restoreY !== null && Date.now() > restoreDeadline) restoreY = null;
			if (restoreY === null && scrollY !== lastScrollY) {
				lastScrollY = scrollY;
				post({ type: "scroll", y: scrollY });
			}
		});
	};

	document.addEventListener(
		"mousemove",
		(event) => {
			if (!enabled) return;
			const el = targetAt(event.clientX, event.clientY);
			const path = el ? pathOf(el) : null;
			if (path === lastHoverPath) return;
			lastHoverPath = path;
			post({ type: "hover", rect: el ? rectOf(el) : null });
		},
		true,
	);

	document.addEventListener("mouseleave", () => {
		if (!enabled) return;
		lastHoverPath = null;
		post({ type: "hover", rect: null });
	});

	// Escape pressed while the frame has focus never reaches the host window,
	// so the frame forwards it out.
	document.addEventListener(
		"keydown",
		(event) => {
			if (event.key !== "Escape") return;
			post({ type: "escape" });
		},
		true,
	);

	document.addEventListener(
		"mousedown",
		() => {
			post({ type: "pointer-down" });
		},
		true,
	);

	document.addEventListener(
		"click",
		(event) => {
			if (!enabled) return;
			event.preventDefault();
			event.stopPropagation();
			const el = targetAt(event.clientX, event.clientY);
			if (!el) return;
			const rect = rectOf(el);
			if (!rect) return;
			post({
				type: "pick",
				anchor: {
					path: pathOf(el),
					tag: el.tagName.toLowerCase(),
					text: (el.textContent || "").trim().slice(0, 140),
					offsetX: fraction(event.clientX - rect.left, rect.width),
					offsetY: fraction(event.clientY - rect.top, rect.height),
				},
				rect,
			});
		},
		true,
	);

	addEventListener("scroll", schedule, true);
	addEventListener("resize", schedule);
	for (const type of ["wheel", "touchstart", "keydown"]) {
		addEventListener(type, () => {
			restoreY = null;
		}, { capture: true, passive: true });
	}
	new ResizeObserver(() => {
		applyRestore();
		schedule();
	}).observe(document.documentElement);
	new MutationObserver((records) => {
		for (const record of records) {
			if (record.type === "childList") {
				resolveCache.clear();
				break;
			}
		}
		schedule();
	}).observe(document.documentElement, {
		subtree: true,
		childList: true,
		attributes: true,
		characterData: true,
	});

	addEventListener("message", (event) => {
		const data = event.data;
		if (!data || data.channel !== HOST) return;
		if (data.type === "set-mode") {
			enabled = Boolean(data.enabled);
			document.documentElement.style.cursor = enabled ? "crosshair" : "";
			if (!enabled) {
				lastHoverPath = null;
				post({ type: "hover", rect: null });
			}
		}
		if (data.type === "track") {
			tracked = Array.isArray(data.anchors) ? data.anchors : [];
			schedule();
		}
		if (data.type === "restore-scroll") {
			restoreY = Number(data.y) || 0;
			restoreDeadline = Date.now() + 1000;
			applyRestore();
		}
	});

	post({ type: "ready" });
})();`;
