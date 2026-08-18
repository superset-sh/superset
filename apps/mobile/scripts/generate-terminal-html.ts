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

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const read = (relativePath: string) =>
	readFileSync(join(mobileRoot, relativePath), "utf8");

const xtermJs = read("node_modules/@xterm/xterm/lib/xterm.js");
const xtermCss = read("node_modules/@xterm/xterm/css/xterm.css");
const fitAddonJs = read("node_modules/@xterm/addon-fit/lib/addon-fit.js");
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
 *   page -> RN: {type:"ready"} | {type:"dial", id, replay} |
 *               {type:"state", state} | {type:"control", message}
 *   RN -> page: {type:"dialUrl", id, url?, error?} | {type:"input", data} |
 *               {type:"resume"} | {type:"focus"}
 */
const runtimeJs = /* js */ `
(function () {
	var RN = window.ReactNativeWebView;
	function post(message) {
		if (RN) RN.postMessage(JSON.stringify(message));
	}

	var term = new Terminal({
		allowTransparency: false,
		cursorBlink: true,
		fontFamily: "Menlo, monospace",
		fontSize: 12,
		scrollback: 5000,
		theme: {
			background: "#0a0a0a",
			foreground: "#fafafa",
			cursor: "#fafafa",
			selectionBackground: "rgba(250, 250, 250, 0.25)",
		},
	});
	var fit = new FitAddon.FitAddon();
	term.loadAddon(fit);
	term.open(document.getElementById("term"));
	fit.fit();

	var BASE_RECONNECT_DELAY_MS = 500;
	var MAX_RECONNECT_DELAY_MS = 10000;
	var MAX_RECONNECT_ATTEMPTS = 12;
	var DIAL_TIMEOUT_MS = 15000;

	var ws = null;
	var attempts = 0;
	var everAttached = false;
	var hasReceivedBytes = false;
	var terminated = false;
	var reconnectTimer = null;
	var dialSeq = 0;
	var pendingDials = {};
	var state = null;

	function setState(next) {
		if (state === next) return;
		state = next;
		post({ type: "state", state: next });
	}

	function requestDialUrl() {
		return new Promise(function (resolve, reject) {
			var id = ++dialSeq;
			pendingDials[id] = { resolve: resolve, reject: reject };
			post({ type: "dial", id: id, replay: hasReceivedBytes ? "0" : "1" });
			setTimeout(function () {
				if (pendingDials[id]) {
					delete pendingDials[id];
					reject(new Error("dial timeout"));
				}
			}, DIAL_TIMEOUT_MS);
		});
	}

	// Same job as web's primeRelayAffinity: browsers follow fly-replay on HTTP
	// but not on a WS upgrade, so a GET to _whoowns pins edge affinity first.
	// Also the only place the upgrade's real HTTP status is observable: 403 is
	// a definitive access denial (the relay only 403s a verified token).
	function primeAffinity(wsUrl) {
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

	function connect() {
		if (terminated) return;
		var gen = generation;
		setState(everAttached ? "reconnecting" : "connecting");
		requestDialUrl()
			.then(function (url) {
				if (gen !== generation || terminated) return;
				return primeAffinity(url).then(function (status) {
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

		socket.onmessage = function (event) {
			if (gen !== generation) return;
			if (event.data instanceof ArrayBuffer) {
				hasReceivedBytes = true;
				term.write(new Uint8Array(event.data));
				return;
			}
			var message;
			try {
				message = JSON.parse(String(event.data));
			} catch (error) {
				return;
			}
			if (message.type === "attached") {
				attempts = 0;
				everAttached = true;
				setState("open");
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

	function sendResize() {
		if (ws && ws.readyState === 1) {
			ws.send(
				JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })
			);
		}
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
			generation += 1;
			terminated = false;
			attempts = 0;
			everAttached = false;
			hasReceivedBytes = false;
			clearTimeout(reconnectTimer);
			if (ws) {
				var oldSocket = ws;
				ws = null;
				try {
					oldSocket.close();
				} catch (error) {}
			}
			term.reset();
			connect();
		} else if (message.type === "focus") {
			term.focus();
		}
	}
	// iOS delivers RN postMessage on window; older paths used document.
	window.addEventListener("message", onBridgeMessage);
	document.addEventListener("message", onBridgeMessage);

	post({ type: "ready" });
	connect();
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
</style>
</head>
<body>
<div id="term"></div>
<script>${xtermJs}</script>
<script>${fitAddonJs}</script>
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
