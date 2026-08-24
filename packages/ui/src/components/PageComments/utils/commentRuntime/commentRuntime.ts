export interface CommentAnchor {
	path: string;
	tag: string;
	text: string;
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
	| { type: "track"; anchors: { id: string; anchor: CommentAnchor }[] };

export type HostMessage = HostMessageBody & { channel: typeof HOST_CHANNEL };

export type FrameMessage =
	| { channel: typeof FRAME_CHANNEL; type: "ready" }
	| { channel: typeof FRAME_CHANNEL; type: "hover"; rect: FrameRect | null }
	| { channel: typeof FRAME_CHANNEL; type: "pointer-down" }
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

const RUNTIME_SOURCE = `(() => {
	const HOST = ${JSON.stringify(HOST_CHANNEL)};
	const FRAME = ${JSON.stringify(FRAME_CHANNEL)};

	let enabled = false;
	let tracked = [];
	let lastHoverPath = null;
	let frame = 0;

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

	const resolve = (path) => {
		if (!path) return null;
		try {
			return document.body.querySelector(":scope > " + path);
		} catch {
			return null;
		}
	};

	const rectOf = (el) => {
		const r = el.getBoundingClientRect();
		if (r.width === 0 && r.height === 0) return null;
		return { top: r.top, left: r.left, width: r.width, height: r.height };
	};

	const targetAt = (x, y) => {
		const el = document.elementFromPoint(x, y);
		if (!el || el === document.body || el === document.documentElement) return null;
		return el;
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
				},
				rect,
			});
		},
		true,
	);

	addEventListener("scroll", schedule, true);
	addEventListener("resize", schedule);
	new ResizeObserver(schedule).observe(document.documentElement);
	new MutationObserver(schedule).observe(document.documentElement, {
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
	});

	post({ type: "ready" });
})();`;

export function injectCommentRuntime(html: string): string {
	const tag = `<script>${RUNTIME_SOURCE}</script>`;
	const close = html.lastIndexOf("</body>");
	if (close === -1) return html + tag;
	return html.slice(0, close) + tag + html.slice(close);
}
