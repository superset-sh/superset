/**
 * Generates the self-contained terminal WebView page: xterm.js + fit addon +
 * the socket/bridge runtime, inlined into one HTML string exported as a TS
 * module (WKWebView loads it via `source={{ html }}`, so no asset pipeline or
 * CSP exceptions are involved).
 *
 * Run from apps/mobile after bumping @xterm/*:
 *   bun run scripts/generate-terminal-html.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FRESH_SHELL_INPUT_MODE_RESET } from "@superset/shared/leaked-input-mode-reclaim";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const read = (relativePath: string) =>
	readFileSync(join(mobileRoot, relativePath), "utf8");

const xtermJs = read("node_modules/@xterm/xterm/lib/xterm.js");
const xtermCss = read("node_modules/@xterm/xterm/css/xterm.css");
const fitAddonJs = read("node_modules/@xterm/addon-fit/lib/addon-fit.js");
const serializeAddonJs = read(
	"node_modules/@xterm/addon-serialize/lib/addon-serialize.js",
);
const xtermVersion = (
	JSON.parse(read("node_modules/@xterm/xterm/package.json")) as {
		version: string;
	}
).version;

/**
 * Page runtime. Mirrors web's TerminalConnection contract
 * (apps/web .../WebTerminal/TerminalConnection.ts): binary WS frames are raw
 * PTY bytes, JSON text frames are control messages, client sends
 * `{type:"input"|"resize"}`. The socket lives HERE (not in RN) so PTY output
 * never crosses the RN bridge; RN only signs dial URLs and relays UI intents.
 *
 * Bridge protocol (JSON over postMessage):
 *   page -> RN: {type:"ready"} | {type:"dial", id, seq} |
 *               {type:"state", state} | {type:"control", message} |
 *               {type:"openUrl", url} | {type:"copy", text} |
 *               {type:"select", active, hasSelection} |
 *               {type:"scroll", atBottom} |
 *               {type:"snapshot", terminalId, data, epoch, seq}
 *   RN -> page: {type:"attach", terminalId, restore} |
 *               {type:"switch", terminalId, restore} |
 *               {type:"dialUrl", id, url?, error?} | {type:"input", data} |
 *               {type:"resume"} | {type:"focus"} |
 *               {type:"copySelection"} | {type:"scrollToBottom"}
 *
 * Warm restore: RN keeps a small cache of serialized buffers keyed by
 * terminal id (see warmTerminalCache). `attach`/`switch` hand one back, the
 * page paints it before it has a socket, and `dial` carries the paired stream
 * position so the host's `?seq=` catch-up sends only the bytes this buffer is
 * missing. Same contract desktop's renderer uses (terminal-seq-anchor.ts).
 *
 * Touch: a tap on a link opens it, a long press enters select mode (native
 * iOS selection over a frozen snapshot of the buffer), and an overlay
 * scrollbar appears while scrolled up. See the sections below.
 */
const runtimeJs = /* js */ `
(function () {
	var RN = window.ReactNativeWebView;
	function post(message) {
		if (RN) RN.postMessage(JSON.stringify(message));
	}

	// Interpolated from @superset/shared so the page and desktop's renderer
	// disarm the same modes.
	var FRESH_SHELL_INPUT_MODE_RESET = ${JSON.stringify(FRESH_SHELL_INPUT_MODE_RESET)};

	var term = new Terminal({
		allowTransparency: false,
		cursorBlink: true,
		fontFamily: "Menlo, monospace",
		fontSize: 12,
		scrollback: 5000,
		// The built-in scrollbar only reveals on hover; the overlay one below
		// replaces it, and dropping it gives its 14px gutter back to the columns.
		scrollbar: { showScrollbar: false },
		theme: {
			background: "#0a0a0a",
			foreground: "#fafafa",
			cursor: "#fafafa",
			selectionBackground: "rgba(250, 250, 250, 0.25)",
		},
	});
	var fit = new FitAddon.FitAddon();
	term.loadAddon(fit);
	// Snapshots are handed to RN over the bridge and held in memory, so this
	// is deliberately well under the 5000-line scrollback above.
	var SNAPSHOT_SCROLLBACK = 1000;
	var serializer = new SerializeAddon.SerializeAddon();
	term.loadAddon(serializer);
	term.open(document.getElementById("term"));
	fit.fit();

	var BASE_RECONNECT_DELAY_MS = 500;
	var MAX_RECONNECT_DELAY_MS = 10000;
	var MAX_RECONNECT_ATTEMPTS = 12;
	var DIAL_TIMEOUT_MS = 15000;

	var ws = null;
	var attempts = 0;
	var everAttached = false;
	var terminated = false;
	var reconnectTimer = null;
	var dialSeq = 0;
	var pendingDials = {};
	var state = null;

	// Which session this page is showing. RN owns it; snapshots are tagged
	// with it so a snapshot posted while switching can't be filed under the
	// session being switched to.
	var terminalId = null;

	/**
	 * Where this buffer sits in the host's PTY output stream: every byte of
	 * the epoch up to seq has been parsed into this xterm. A null epoch means
	 * no trustworthy position. Counting is armed by the host's synced frame
	 * and disarmed for each new socket, so the bytes the host synthesizes
	 * ahead of an anchor are never counted.
	 */
	var epoch = null;
	var seq = 0;
	var counting = false;
	/** The buffer was painted from a snapshot rather than by the host. */
	var restored = false;
	/**
	 * A socket closed before it ever attached. Only then is a denial worth
	 * probing for: the probe is a whole round trip, and paying it on every
	 * dial was ~220ms of every cold open.
	 */
	var suspectDenied = false;
	/** Backstop for the "ready" -> "attach" handshake below. */
	var startTimer = null;

	/** How long output must stop before a snapshot is worth taking. */
	var SNAPSHOT_QUIET_MS = 300;
	/** Ceiling on snapshot rate while a session is producing steadily. */
	var SNAPSHOT_MIN_INTERVAL_MS = 2000;
	var snapshotTimer = null;
	var lastSnapshotAt = 0;

	function setState(next) {
		if (state === next) return;
		state = next;
		post({ type: "state", state: next });
	}

	/**
	 * The "?seq=" attach mode for the next dial, in the host's vocabulary:
	 * an "epoch:seq" anchor asks for exactly the missed bytes, "new" asks a
	 * virgin buffer to be filled from the ring tail, and "none" says the
	 * buffer holds content of unknown position — reanchor, never overwrite it.
	 */
	function seqParam() {
		if (epoch !== null) return epoch + ":" + seq;
		return restored ? "none" : "new";
	}

	function requestDialUrl() {
		return new Promise(function (resolve, reject) {
			var id = ++dialSeq;
			pendingDials[id] = { resolve: resolve, reject: reject };
			post({ type: "dial", id: id, seq: seqParam() });
			setTimeout(function () {
				if (pendingDials[id]) {
					delete pendingDials[id];
					reject(new Error("dial timeout"));
				}
			}, DIAL_TIMEOUT_MS);
		});
	}

	// Same job as workspace-client's probeRelayHost: a GET to _whoowns is the
	// only place the upgrade's real HTTP status is observable. 403 is a
	// definitive access denial (the relay only 403s a verified token).
	function probeHost(wsUrl) {
		try {
			var url = new URL(wsUrl);
			var match = url.pathname.match(/^\\/hosts\\/[^/]+/);
			if (!match) return Promise.resolve(null);
			url.pathname = match[0] + "/_whoowns";
			url.protocol = url.protocol === "wss:" ? "https:" : "http:";
			return fetch(url.toString(), { cache: "no-store" })
				.then(function (res) {
					return res.status;
				})
				.catch(function () {
					return null;
				});
		} catch (error) {
			return Promise.resolve(null);
		}
	}

	// Bumped on every in-page session switch; stale async work (dial chains,
	// socket handlers, reconnect timers) bails when its generation is behind.
	var generation = 0;

	// Whether the terminal screen is actually on screen — RN owns this (screen
	// focus AND app foreground) and pushes it in. The host sizes the PTY to the
	// smallest visible client, so a phone that has been backgrounded must stop
	// counting: otherwise it holds every desktop pane at phone width.
	var isVisible = true;

	/**
	 * This page has committed to a session — set by whichever of RN's attach,
	 * a switch, or the backstop timer gets there first. Anything arriving
	 * afterwards must not dial again: two sockets on one xterm both count into
	 * seq, which corrupts the anchor the next catch-up is measured from.
	 */
	var started = false;

	function claimStart() {
		if (startTimer !== null) {
			clearTimeout(startTimer);
			startTimer = null;
		}
		if (started) return false;
		started = true;
		return true;
	}

	/** First attach of this page, from RN's answer to "ready". */
	function beginSession(id, restore) {
		if (!claimStart()) {
			// The backstop fired, or a switch landed first. The session is
			// already running, so don't repaint or redial — but a backstop
			// start has no terminal id, and without one this page can never
			// file a snapshot. Adopt it.
			if (terminalId === null && id !== null) terminalId = id;
			return;
		}
		if (id !== null) terminalId = id;
		applyRestore(restore);
		connect();
	}

	function connect() {
		if (terminated) return;
		var gen = generation;
		setState(everAttached ? "reconnecting" : "connecting");
		requestDialUrl()
			.then(function (url) {
				if (gen !== generation || terminated) return;
				if (!suspectDenied) {
					openSocket(url, gen);
					return;
				}
				return probeHost(url).then(function (status) {
					if (gen !== generation || terminated) return;
					if (status === 403) {
						terminated = true;
						setState("denied");
						return;
					}
					openSocket(url, gen);
				});
			})
			.catch(function () {
				scheduleReconnect(gen);
			});
	}

	function openSocket(url, gen) {
		if (terminated || gen !== generation) return;
		var socket;
		try {
			socket = new WebSocket(url);
		} catch (error) {
			scheduleReconnect(gen);
			return;
		}
		socket.binaryType = "arraybuffer";
		ws = socket;
		// Per socket: the bytes the host synthesizes ahead of an anchor are
		// not part of the stream and must not move "seq".
		counting = false;
		var attachedHere = false;

		socket.onmessage = function (event) {
			if (gen !== generation) return;
			if (event.data instanceof ArrayBuffer) {
				var bytes = new Uint8Array(event.data);
				var counted = counting;
				var length = bytes.byteLength;
				// Counted in the write callback, not on arrival: "seq" has to
				// describe what the buffer HOLDS, or a snapshot taken while
				// writes are still queued would be paired with a position
				// ahead of its own content and the next catch-up would skip
				// the difference.
				term.write(bytes, function () {
					if (counted && gen === generation) seq += length;
				});
				return;
			}
			var message;
			try {
				message = JSON.parse(String(event.data));
			} catch (error) {
				return;
			}
			if (message.type === "synced") {
				epoch = message.epoch;
				seq = message.seq;
				counting = true;
			} else if (message.type === "attached") {
				attempts = 0;
				everAttached = true;
				attachedHere = true;
				suspectDenied = false;
				setState("open");
				// Before the dims: the host's minimum should never briefly
				// include a phone that is already backgrounded.
				sendVisible();
				sendResize();
			} else if (message.type === "exit" || message.type === "error") {
				// Server closes after these; reconnecting would just repeat them.
				terminated = true;
				try {
					socket.close();
				} catch (error) {}
			}
			post({ type: "control", message: message });
		};

		socket.onclose = function () {
			if (ws === socket) ws = null;
			if (gen !== generation) return;
			// Never attached: the relay may have refused this token, which is
			// the one case worth spending a probe on.
			if (!attachedHere) suspectDenied = true;
			if (terminated) {
				setState("ended");
				return;
			}
			scheduleReconnect(gen);
		};
	}

	function scheduleReconnect(gen) {
		if (terminated || gen !== generation) return;
		attempts += 1;
		if (attempts >= MAX_RECONNECT_ATTEMPTS) {
			setState("error");
			return;
		}
		setState(everAttached ? "reconnecting" : "connecting");
		var delay = Math.min(
			MAX_RECONNECT_DELAY_MS,
			BASE_RECONNECT_DELAY_MS * Math.pow(2, attempts - 1)
		);
		clearTimeout(reconnectTimer);
		reconnectTimer = setTimeout(connect, delay);
	}

	// iOS wheel events from touch scrolling can carry undefined coordinates,
	// making xterm emit mouse reports with literal "NaN" cells — malformed
	// sequences the TUI's parser leaks into the input line as typed text.
	var MALFORMED_MOUSE_REPORT = /\\u001b\\[<[0-9;]*NaN[0-9;aN]*[Mm]/g;
	function sendInput(data) {
		if (data.indexOf("NaN") !== -1) {
			data = data.replace(MALFORMED_MOUSE_REPORT, "");
			if (!data) return;
		}
		if (ws && ws.readyState === 1) {
			ws.send(JSON.stringify({ type: "input", data: data }));
		}
	}

	function sendVisible() {
		if (ws && ws.readyState === 1) {
			ws.send(JSON.stringify({ type: "visible", visible: isVisible }));
		}
	}

	function sendResize() {
		if (ws && ws.readyState === 1) {
			ws.send(
				JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })
			);
		}
	}

	/**
	 * Hand RN a paintable copy of this session, paired with the stream
	 * position it reflects. The next mount writes it before it has a socket,
	 * and dials with that position so the host sends the difference instead of
	 * a replay.
	 */
	function exportSnapshot() {
		if (snapshotTimer !== null) {
			clearTimeout(snapshotTimer);
			snapshotTimer = null;
		}
		if (terminalId === null) return;
		lastSnapshotAt = Date.now();
		var data;
		try {
			data = serializer.serialize({ scrollback: SNAPSHOT_SCROLLBACK });
		} catch (error) {
			return;
		}
		post({
			type: "snapshot",
			terminalId: terminalId,
			data: data,
			epoch: epoch,
			seq: seq,
		});
	}

	/**
	 * Snapshot while the session is quiet rather than only on the way out. A
	 * popped screen can take the WebView down in the same tick as the blur,
	 * which leaves no room for a reply to cross the bridge — so the cache is
	 * kept current in the background and the export on hide is only ever an
	 * improvement on it. Falling behind by a couple of seconds costs nothing:
	 * the position travels with the buffer, so whatever is missing arrives as
	 * catch-up on the next attach.
	 */
	function scheduleSnapshot() {
		clearTimeout(snapshotTimer);
		var sinceLast = Date.now() - lastSnapshotAt;
		var wait =
			sinceLast < SNAPSHOT_MIN_INTERVAL_MS
				? SNAPSHOT_MIN_INTERVAL_MS - sinceLast
				: SNAPSHOT_QUIET_MS;
		snapshotTimer = setTimeout(function () {
			snapshotTimer = null;
			exportSnapshot();
		}, wait);
	}

	/** Paint a cached buffer and adopt the position it was captured at. */
	function applyRestore(restore) {
		if (!restore || !restore.data) return;
		term.write(restore.data);
		restored = true;
		if (typeof restore.epoch === "string") {
			epoch = restore.epoch;
			seq = restore.seq;
		}
		// A serialized buffer bakes in whatever input modes were armed when it
		// was captured (mouse tracking, bracketed paste, application cursor).
		// Replaying them arms this fresh xterm for a program that may not even
		// be running any more; the attach preamble re-asserts the real ones.
		term.write(FRESH_SHELL_INPUT_MODE_RESET);
	}

	term.onData(sendInput);
	term.onResize(sendResize);
	term.onTitleChange(function (title) {
		post({ type: "control", message: { type: "title", title: title } });
	});
	window.addEventListener("resize", function () {
		fit.fit();
	});

	function onBridgeMessage(event) {
		var message;
		try {
			message = JSON.parse(event.data);
		} catch (error) {
			return;
		}
		if (message.type === "dialUrl") {
			var pending = pendingDials[message.id];
			if (!pending) return;
			delete pendingDials[message.id];
			if (message.url) pending.resolve(message.url);
			else pending.reject(new Error(message.error || "dial failed"));
		} else if (message.type === "input") {
			sendInput(message.data);
		} else if (message.type === "resume") {
			// Mirrors web's handleResume: reset the budget and redial if closed —
			// also the recovery path after the attempt budget gave up.
			if (terminated) return;
			attempts = 0;
			clearTimeout(reconnectTimer);
			if (!ws || ws.readyState === 3) connect();
		} else if (message.type === "switch") {
			// In-page session switch: the WebView (and its warm TLS pool) stays
			// alive; only the socket and buffer turn over. The next dial request
			// is signed RN-side with the new terminalId.
			// Capture the session being left before its buffer is reset —
			// coming back to this tab should cost a delta, not a replay.
			exportSnapshot();
			generation += 1;
			// A switch can beat RN's answer to "ready" (the active tab can
			// resolve while the page is still booting), so it has to claim the
			// start itself or the later attach opens a second socket.
			claimStart();
			terminated = false;
			attempts = 0;
			everAttached = false;
			counting = false;
			epoch = null;
			seq = 0;
			restored = false;
			clearTimeout(reconnectTimer);
			if (ws) {
				var oldSocket = ws;
				ws = null;
				try {
					oldSocket.close();
				} catch (error) {}
			}
			exitSelectMode();
			// term.reset() clears the buffer synchronously but does NOT discard
			// what is already queued in xterm's write buffer, so bytes from the
			// session being left would be parsed into the one being entered —
			// above its restored content. An empty write's callback runs once
			// everything queued before it has been parsed, which is the barrier
			// this needs.
			var switchGen = generation;
			var nextTerminalId = message.terminalId;
			var nextRestore = message.restore;
			term.write("", function () {
				// A second switch while this was pending owns the page now.
				if (switchGen !== generation) return;
				term.reset();
				// reset() fires neither onScroll nor onWriteParsed, so the
				// scrollbar and the at-bottom flag would still describe the
				// session we left.
				scheduleScrollbar();
				terminalId = nextTerminalId;
				applyRestore(nextRestore);
				connect();
			});
		} else if (message.type === "attach") {
			beginSession(message.terminalId, message.restore);
		} else if (message.type === "copySelection") {
			copySelection();
		} else if (message.type === "scrollToBottom") {
			term.scrollToBottom();
		} else if (message.type === "visible") {
			if (isVisible === message.visible) return;
			isVisible = message.visible;
			sendVisible();
			// Leaving the screen is the last reliable moment to capture this
			// buffer: a popped screen takes the whole WebView with it.
			if (!isVisible) exportSnapshot();
		} else if (message.type === "focus") {
			allowTextareaFocus = true;
			term.focus();
			setTimeout(function () {
				allowTextareaFocus = false;
			}, 250);
		}
	}
	// iOS delivers RN postMessage on window; older paths used document.
	window.addEventListener("message", onBridgeMessage);
	document.addEventListener("message", onBridgeMessage);

	var termEl = document.getElementById("term");
	var screen = term.element.querySelector(".xterm-screen");

	// All typing goes through the composer and quick keys (terminal.send
	// frames pastes and separates Enter server-side, #6284); the soft
	// keyboard must never come up from inside the page. WKWebView turns
	// some taps into real clicks, and xterm focuses its hidden textarea on
	// click — so focus is refused unless RN explicitly asked for it.
	var allowTextareaFocus = false;
	term.textarea.addEventListener("focus", function () {
		if (!allowTextareaFocus) term.textarea.blur();
	});
	var TAP_SLOP_PX = 10;
	var TAP_MAX_MS = 300;
	var LONG_PRESS_MS = 450;

	// --- links -----------------------------------------------------------------
	// xterm's linkifier is hover-driven: mousemove asks the providers, then a
	// mousedown/mouseup pair on the same link activates it. On touch none of
	// that arrives — xterm's own gesture handling cancels the touch to own
	// scrolling, so the browser never synthesizes mouse events from a tap. A
	// tap here replays the sequence itself, aimed at the screen element only
	// (no bubbling) so xterm's mousedown handlers — focus, selection, mouse
	// reports — stay out of it. Providers answer synchronously, so whether a
	// link opened is known before touchend returns.
	var URL_PATTERN = /\\bhttps?:\\/\\/[^\\s<>[\\]'"]+/g;
	var TRAILING_PUNCTUATION = /[.,;:!?]+$/;

	function trimUrl(url) {
		var depth = 0;
		var end = url.length;
		for (var i = 0; i < url.length; i++) {
			if (url[i] === "(") depth++;
			else if (url[i] === ")") {
				if (depth > 0) depth--;
				else {
					end = i;
					break;
				}
			}
		}
		url = url.slice(0, end);
		while (url.endsWith("(")) url = url.slice(0, -1);
		return url.replace(TRAILING_PUNCTUATION, "");
	}

	// The buffer row containing 1-based row y plus its wrapped continuations,
	// with every character mapped back to its cell so regex offsets become
	// xterm ranges. Wide characters occupy two cells but one string position.
	var scratchCell = term.buffer.active.getNullCell();
	function readLogicalLine(y) {
		var buffer = term.buffer.active;
		if (!buffer.getLine(y - 1)) return { text: "", cells: [] };
		var start = y - 1;
		while (start > 0 && buffer.getLine(start).isWrapped) start--;
		var end = y - 1;
		while (end + 1 < buffer.length && buffer.getLine(end + 1).isWrapped) end++;
		var text = "";
		var cells = [];
		for (var row = start; row <= end; row++) {
			var line = buffer.getLine(row);
			if (!line) break;
			for (var col = 0; col < line.length; col++) {
				line.getCell(col, scratchCell);
				if (scratchCell.getWidth() === 0) continue;
				var chars = scratchCell.getChars() || " ";
				for (var k = 0; k < chars.length; k++) {
					cells.push({ x: col + 1, y: row + 1 });
				}
				text += chars;
			}
		}
		return { text: text, cells: cells };
	}

	var linkActivated = false;
	function openUrl(url) {
		if (!/^https?:\\/\\//i.test(url)) return;
		linkActivated = true;
		post({ type: "openUrl", url: url });
	}

	term.registerLinkProvider({
		provideLinks: function (y, callback) {
			var logical = readLogicalLine(y);
			var links = [];
			var match;
			URL_PATTERN.lastIndex = 0;
			while ((match = URL_PATTERN.exec(logical.text))) {
				var url = trimUrl(match[0]);
				if (!url) continue;
				links.push({
					text: url,
					range: {
						start: logical.cells[match.index],
						end: logical.cells[match.index + url.length - 1],
					},
					decorations: { underline: true, pointerCursor: false },
					activate: function (event, text) {
						openUrl(text);
					},
				});
			}
			callback(links.length ? links : undefined);
		},
	});
	// OSC 8 hyperlinks (ls --hyperlink, agents that emit them) go through
	// xterm's own provider; only their activation needs wiring.
	term.options.linkHandler = {
		activate: function (event, uri) {
			openUrl(uri);
		},
	};

	function synthesizeMouse(type, x, y) {
		screen.dispatchEvent(
			new MouseEvent(type, { clientX: x, clientY: y, bubbles: false, cancelable: true })
		);
	}

	function activateLinkAt(x, y) {
		var rect = screen.getBoundingClientRect();
		var cellHeight = rect.height / term.rows;
		// The linkifier ignores a move that stays in the last hovered cell and
		// may have dropped that cell's link since, so hover a neighbouring row
		// first to force a fresh answer for this one.
		var primeY = y - rect.top >= cellHeight ? y - cellHeight : y + cellHeight;
		linkActivated = false;
		synthesizeMouse("mousemove", x, primeY);
		synthesizeMouse("mousemove", x, y);
		synthesizeMouse("mousedown", x, y);
		synthesizeMouse("mouseup", x, y);
		return linkActivated;
	}

	// --- select mode -----------------------------------------------------------
	// xterm has no touch selection, and its rows are rebuilt on every write, so
	// a long press freezes the buffer into a plain selectable <pre> laid over
	// the terminal. The selection on it is WebKit's own — loupe, grabbers,
	// callout menu — and Copy from the callout comes through the copy event
	// below. Rows that xterm wrapped are joined back into one line on copy.
	// The Copy button is native, rendered by RN off the "select" state
	// messages; RN answers with copySelection.
	var selectOverlay = document.getElementById("select");
	var selectText = document.getElementById("select-text");
	var selecting = false;
	var softWraps = null;
	var selectionEmptyTimer = null;

	function hasLiveSelection() {
		var selection = window.getSelection();
		return !!selection && selection.rangeCount > 0 && !selection.isCollapsed;
	}

	function snapshotBuffer() {
		var buffer = term.buffer.active;
		var rows = [];
		var wraps = [];
		var offset = 0;
		for (var row = 0; row < buffer.length; row++) {
			var line = buffer.getLine(row);
			if (!line) break;
			var next = buffer.getLine(row + 1);
			var wrapsOn = !!(next && next.isWrapped);
			var text = line.translateToString(!wrapsOn);
			rows.push(text);
			offset += text.length;
			if (row + 1 < buffer.length) {
				if (wrapsOn) wraps.push(offset);
				offset += 1;
			}
		}
		return { text: rows.join("\\n"), softWraps: wraps };
	}

	function offsetAt(container, offset) {
		var range = document.createRange();
		range.selectNodeContents(selectText);
		range.setEnd(container, offset);
		return range.toString().length;
	}

	function joinWrapped(text, from) {
		var out = "";
		for (var i = 0; i < text.length; i++) {
			if (text[i] === "\\n" && softWraps.has(from + i)) continue;
			out += text[i];
		}
		return out;
	}

	function selectedText() {
		var selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return "";
		var range = selection.getRangeAt(0);
		var start = offsetAt(range.startContainer, range.startOffset);
		var end = offsetAt(range.endContainer, range.endOffset);
		var text = selectText.textContent.slice(start, end);
		return joinWrapped(text, start);
	}

	// Select the whitespace-delimited run under the finger — a path, a flag,
	// a hash — trimmed to the URL when it starts with one. Soft-wrap newlines
	// don't break the run.
	function selectRunAt(x, y) {
		var node = selectText.firstChild;
		var caret = document.caretRangeFromPoint(x, y);
		if (!node || !caret || caret.startContainer !== node) return;
		var text = node.data;
		function isBreak(i) {
			return /\\s/.test(text[i]) && !(text[i] === "\\n" && softWraps.has(i));
		}
		var start = caret.startOffset;
		while (start > 0 && !isBreak(start - 1)) start--;
		var end = caret.startOffset;
		while (end < text.length && !isBreak(end)) end++;
		if (start === end) return;
		var run = joinWrapped(text.slice(start, end), start);
		URL_PATTERN.lastIndex = 0;
		var match = URL_PATTERN.exec(run);
		if (match && match.index === 0) {
			var keep = trimUrl(match[0]).length;
			end = start;
			while (keep > 0 && end < text.length) {
				if (!(text[end] === "\\n" && softWraps.has(end))) keep--;
				end++;
			}
		}
		var range = document.createRange();
		range.setStart(node, start);
		range.setEnd(node, end);
		var selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
	}

	function enterSelectMode(x, y) {
		var rowsEl = term.element.querySelector(".xterm-rows");
		var rowsStyle = getComputedStyle(rowsEl);
		var screenRect = screen.getBoundingClientRect();
		var termRect = termEl.getBoundingClientRect();
		var cellHeight = screenRect.height / term.rows;
		selectText.style.fontFamily = rowsStyle.fontFamily;
		selectText.style.fontSize = rowsStyle.fontSize;
		selectText.style.letterSpacing = rowsStyle.letterSpacing;
		selectText.style.lineHeight = cellHeight + "px";
		selectText.style.paddingTop = screenRect.top - termRect.top + "px";
		selectText.style.paddingLeft = screenRect.left - termRect.left + "px";
		var snapshot = snapshotBuffer();
		softWraps = new Set(snapshot.softWraps);
		selectText.textContent = snapshot.text;
		selecting = true;
		selectOverlay.classList.add("active");
		selectOverlay.scrollTop = term.buffer.active.viewportY * cellHeight;
		selectRunAt(x, y);
		// Nothing under the finger to select: never enter the mode at all —
		// select mode exists only while a selection does.
		if (!hasLiveSelection()) {
			selecting = false;
			selectOverlay.classList.remove("active");
			selectText.textContent = "";
			softWraps = null;
			return;
		}
		postSelect();
	}

	function exitSelectMode() {
		if (!selecting) return;
		clearTimeout(selectionEmptyTimer);
		selecting = false;
		window.getSelection().removeAllRanges();
		selectOverlay.classList.remove("active");
		selectText.textContent = "";
		softWraps = null;
		postSelect();
	}

	function postSelect() {
		post({
			type: "select",
			active: selecting,
			hasSelection: selecting && hasLiveSelection(),
		});
	}
	// Select mode lives exactly as long as the selection: deselecting exits.
	// The exit is debounced because iOS momentarily empties the selection
	// mid-gesture (loupe placement, callout show/hide).
	document.addEventListener("selectionchange", function () {
		if (!selecting) return;
		clearTimeout(selectionEmptyTimer);
		if (hasLiveSelection()) {
			postSelect();
			return;
		}
		selectionEmptyTimer = setTimeout(function () {
			if (selecting && !hasLiveSelection()) exitSelectMode();
		}, 250);
	});

	function copySelection() {
		var text = selectedText();
		if (!text) return;
		post({ type: "copy", text: text });
		exitSelectMode();
	}

	document.addEventListener("copy", function (event) {
		if (!selecting) return;
		var text = selectedText();
		if (!text) return;
		event.clipboardData.setData("text/plain", text);
		event.preventDefault();
		setTimeout(exitSelectMode, 0);
	});

	// A plain tap while nothing is selected leaves select mode; a tap while
	// something is selected just deselects, the way iOS does everywhere.
	var overlayTouch = null;
	selectOverlay.addEventListener(
		"touchstart",
		function (event) {
			if (event.touches.length !== 1) {
				overlayTouch = null;
				return;
			}
			var selection = window.getSelection();
			overlayTouch = {
				x: event.touches[0].clientX,
				y: event.touches[0].clientY,
				at: Date.now(),
				hadSelection: !!selection && selection.rangeCount > 0 && !selection.isCollapsed,
			};
		},
		{ passive: true }
	);
	selectOverlay.addEventListener("touchend", function (event) {
		var touch = overlayTouch;
		overlayTouch = null;
		if (!touch || touch.hadSelection) return;
		var point = event.changedTouches[0];
		if (
			Math.abs(point.clientX - touch.x) > TAP_SLOP_PX ||
			Math.abs(point.clientY - touch.y) > TAP_SLOP_PX ||
			Date.now() - touch.at > TAP_MAX_MS
		) {
			return;
		}
		exitSelectMode();
	});

	// --- touch on the terminal -------------------------------------------------
	var termTouch = null;
	var longPressTimer = null;

	termEl.addEventListener(
		"touchstart",
		function (event) {
			clearTimeout(longPressTimer);
			if (event.touches.length !== 1) {
				termTouch = null;
				return;
			}
			var point = event.touches[0];
			termTouch = { x: point.clientX, y: point.clientY, at: Date.now(), moved: false };
			longPressTimer = setTimeout(function () {
				if (!termTouch || termTouch.moved) return;
				termTouch.longPressed = true;
				enterSelectMode(termTouch.x, termTouch.y);
			}, LONG_PRESS_MS);
		},
		{ passive: true }
	);
	termEl.addEventListener(
		"touchmove",
		function (event) {
			if (!termTouch || termTouch.moved) return;
			var point = event.touches[0];
			if (
				Math.abs(point.clientX - termTouch.x) > TAP_SLOP_PX ||
				Math.abs(point.clientY - termTouch.y) > TAP_SLOP_PX
			) {
				termTouch.moved = true;
				clearTimeout(longPressTimer);
			}
		},
		{ passive: true }
	);
	function endTermTouch(event) {
		clearTimeout(longPressTimer);
		var touch = termTouch;
		termTouch = null;
		if (!touch || touch.moved) return;
		if (touch.longPressed) {
			event.preventDefault();
			return;
		}
		if (event.type !== "touchend" || Date.now() - touch.at > TAP_MAX_MS) return;
		if (activateLinkAt(touch.x, touch.y)) {
			event.preventDefault();
			return;
		}
		// A plain tap on the terminal. The app uses it to dismiss the keyboard
		// now that no overlay sits above the WebView eating scroll drags.
		post({ type: "tap" });
	}
	termEl.addEventListener("touchend", endTermTouch, { passive: false });
	termEl.addEventListener("touchcancel", endTermTouch, { passive: false });

	// --- scrollbar -------------------------------------------------------------
	// Touch scrolling moves xterm's viewport programmatically, so WKWebView has
	// nothing to draw an indicator for. This one shows while scrolled up, so it
	// doubles as the "you're not at the bottom" cue, and drags.
	var scrollbar = document.getElementById("scrollbar");
	var thumb = document.getElementById("scrollbar-thumb");
	var scrollbarFrame = 0;
	// RN draws the scroll-to-bottom button, so it needs this side's answer to
	// the question the scrollbar already asks — the two appear together. The
	// alternate buffer keeps no scrollback, so "hidden" is 0 there and neither
	// shows: a TUI in full-screen mode owns its own scroll, and scrollToBottom
	// would be a no-op.
	var atBottom = true;

	function updateScrollbar() {
		scrollbarFrame = 0;
		var buffer = term.buffer.active;
		var hidden = buffer.length - term.rows;
		var nowAtBottom = hidden <= 0 || buffer.viewportY >= hidden;
		if (nowAtBottom !== atBottom) {
			atBottom = nowAtBottom;
			post({ type: "scroll", atBottom: atBottom });
		}
		// Never hide mid-drag: reaching the bottom would remove the track (and
		// its pointer-events) under the finger.
		if (hidden <= 0 || (buffer.viewportY >= hidden && !thumbDrag)) {
			scrollbar.classList.remove("visible");
			return;
		}
		var trackHeight = scrollbar.clientHeight;
		var thumbHeight = Math.max(24, (trackHeight * term.rows) / buffer.length);
		thumb.style.height = thumbHeight + "px";
		thumb.style.transform =
			"translateY(" + ((trackHeight - thumbHeight) * buffer.viewportY) / hidden + "px)";
		scrollbar.classList.add("visible");
	}
	function scheduleScrollbar() {
		if (!scrollbarFrame) scrollbarFrame = requestAnimationFrame(updateScrollbar);
	}
	term.onScroll(scheduleScrollbar);
	term.onWriteParsed(scheduleScrollbar);
	term.onWriteParsed(scheduleSnapshot);
	term.onResize(scheduleScrollbar);

	var thumbDrag = null;
	scrollbar.addEventListener(
		"touchstart",
		function (event) {
			thumbDrag = {
				y: event.touches[0].clientY,
				viewportY: term.buffer.active.viewportY,
			};
			scrollbar.classList.add("dragging");
		},
		{ passive: true }
	);
	scrollbar.addEventListener(
		"touchmove",
		function (event) {
			if (!thumbDrag) return;
			event.preventDefault();
			var buffer = term.buffer.active;
			var hidden = buffer.length - term.rows;
			var travel = scrollbar.clientHeight - thumb.offsetHeight;
			if (hidden <= 0 || travel <= 0) return;
			var lines = ((event.touches[0].clientY - thumbDrag.y) / travel) * hidden;
			term.scrollToLine(
				Math.max(0, Math.min(hidden, Math.round(thumbDrag.viewportY + lines)))
			);
		},
		{ passive: false }
	);
	function endThumbDrag() {
		thumbDrag = null;
		scrollbar.classList.remove("dragging");
	}
	scrollbar.addEventListener("touchend", endThumbDrag);
	scrollbar.addEventListener("touchcancel", endThumbDrag);

	post({ type: "ready" });
	// Announce the initial scroll state: updateScrollbar only posts on flips,
	// so a remounted page starting at the live edge would otherwise leave RN
	// holding whatever the previous terminal reported.
	post({ type: "scroll", atBottom: atBottom });
	// RN answers "ready" with the cached buffer for this session, if it has
	// one. Dialling before that lands would attach with an empty buffer and
	// pull the whole ring tail back down over content we already had. The
	// timer is a backstop only: a lost answer must never leave the terminal
	// sitting unattached.
	startTimer = setTimeout(function () {
		startTimer = null;
		beginSession(null, null);
	}, 1000);
})();
`;

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<style>
${xtermCss}
html, body {
	margin: 0;
	padding: 0;
	height: 100%;
	background: #0a0a0a;
	overflow: hidden;
	-webkit-text-size-adjust: 100%;
}
#term {
	width: 100%;
	height: 100%;
}
#scrollbar {
	position: absolute;
	top: 4px;
	right: 0;
	bottom: 4px;
	width: 20px;
	opacity: 0;
	pointer-events: none;
	transition: opacity 0.2s;
}
#scrollbar.visible {
	opacity: 1;
	pointer-events: auto;
}
#scrollbar-thumb {
	position: absolute;
	top: 0;
	right: 3px;
	width: 3px;
	border-radius: 2px;
	background: rgba(250, 250, 250, 0.35);
	transition: width 0.15s, background 0.15s;
}
#scrollbar.dragging #scrollbar-thumb {
	width: 6px;
	background: rgba(250, 250, 250, 0.6);
}
#select {
	display: none;
	position: absolute;
	inset: 0;
	overflow: auto;
	-webkit-overflow-scrolling: touch;
	background: #0a0a0a;
	user-select: none;
	-webkit-user-select: none;
}
#select.active {
	display: block;
}
#select-text {
	margin: 0;
	padding-bottom: 96px;
	color: #fafafa;
	white-space: pre;
	font-kerning: none;
	user-select: text;
	-webkit-user-select: text;
}
#select-text::selection {
	background: rgba(250, 250, 250, 0.3);
}
</style>
</head>
<body>
<div id="term"></div>
<div id="scrollbar"><div id="scrollbar-thumb"></div></div>
<div id="select">
	<pre id="select-text"></pre>
</div>
<script>${xtermJs}</script>
<script>${fitAddonJs}</script>
<script>${serializeAddonJs}</script>
<script>${runtimeJs}</script>
</body>
</html>
`;

const output = `// Generated by scripts/generate-terminal-html.ts — do not edit.
// xterm ${xtermVersion}. Regenerate after bumping @xterm/*.

export const TERMINAL_HTML: string = ${JSON.stringify(html)};
`;

const outputPath = join(
	mobileRoot,
	"screens/(authenticated)/workspace/[id]/components/TerminalWebView/terminalHtml.generated.ts",
);
writeFileSync(outputPath, output);
console.log(
	`wrote ${outputPath} (${(output.length / 1024).toFixed(0)} KiB, xterm ${xtermVersion})`,
);
