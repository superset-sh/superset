import { spawn } from "node:child_process";

type Candidate = { command: string; args?: string[] };

function nativeCandidates(): Candidate[] {
	switch (process.platform) {
		case "darwin":
			return [{ command: "pbcopy" }];
		case "win32":
			return [{ command: "clip" }];
		default:
			return [
				{ command: "wl-copy" },
				{ command: "xclip", args: ["-selection", "clipboard"] },
				{ command: "xsel", args: ["--clipboard", "--input"] },
			];
	}
}

function tryCandidate(text: string, c: Candidate): Promise<boolean> {
	return new Promise((resolve) => {
		let child: ReturnType<typeof spawn>;
		try {
			child = spawn(c.command, c.args ?? [], {
				stdio: ["pipe", "ignore", "ignore"],
			});
		} catch {
			resolve(false);
			return;
		}
		child.on("error", () => resolve(false));
		child.on("close", (code) => resolve(code === 0));
		child.stdin?.on("error", () => resolve(false));
		child.stdin?.end(text);
	});
}

/**
 * OSC 52 — `ESC ] 52 ; c ; <base64> BEL`. The terminal emulator (running on
 * the user's local machine, even when this CLI is on a remote host over SSH)
 * intercepts the sequence and writes the payload to the system clipboard.
 * Terminals that don't support it silently drop the sequence.
 */
function emitOsc52(text: string): boolean {
	if (!process.stdout.isTTY) return false;
	const payload = Buffer.from(text, "utf8").toString("base64");
	process.stdout.write(`\x1b]52;c;${payload}\x07`);
	return true;
}

export async function copyToClipboard(text: string): Promise<boolean> {
	// OSC 52 first — works across SSH and is the only path that reaches the
	// user's clipboard on a remote host. Native binaries run as a fallback
	// for local users whose terminal blocks OSC 52 (some iTerm2 configs,
	// tmux without `set-clipboard on`, etc.).
	const osc = emitOsc52(text);
	let native = false;
	for (const c of nativeCandidates()) {
		if (await tryCandidate(text, c)) {
			native = true;
			break;
		}
	}
	return osc || native;
}
