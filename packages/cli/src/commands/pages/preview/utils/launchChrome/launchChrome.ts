import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CdpConnection } from "../cdp";

export interface LaunchedChrome {
	cdp: CdpConnection;
	close: () => Promise<void>;
}

export const CHROME_ARGS = [
	"--headless=new",
	"--remote-debugging-port=0",
	"--no-first-run",
	"--no-default-browser-check",
	"--no-proxy-server",
	"--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE fonts.googleapis.com, EXCLUDE fonts.gstatic.com",
	"--disable-site-isolation-trials",
	"--disable-features=IsolateOrigins,site-per-process,IsolateSandboxedIframes",
	"--disable-gpu",
	"--disable-extensions",
	"--block-new-web-contents",
	"--hide-scrollbars",
	"--mute-audio",
];

async function readDevToolsPort(
	profile: string,
	deadline: number,
): Promise<string> {
	while (Date.now() < deadline) {
		try {
			const [port, path] = readFileSync(
				join(profile, "DevToolsActivePort"),
				"utf-8",
			).split("\n");
			if (port && path) return `ws://127.0.0.1:${port}${path}`;
		} catch {}
		await Bun.sleep(50);
	}
	throw new Error("the browser did not start");
}

export async function launchChrome(
	executable: string,
	{
		startTimeoutMs,
		commandTimeoutMs,
	}: { startTimeoutMs: number; commandTimeoutMs: number },
): Promise<LaunchedChrome> {
	const profile = mkdtempSync(join(tmpdir(), "superset-page-preview-"));
	const child = Bun.spawn(
		[executable, ...CHROME_ARGS, `--user-data-dir=${profile}`, "about:blank"],
		{
			stdout: "ignore",
			stderr: "ignore",
			env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: "disabled:" },
		},
	);
	const cleanup = () => rmSync(profile, { recursive: true, force: true });
	try {
		const url = await readDevToolsPort(profile, Date.now() + startTimeoutMs);
		const cdp = await CdpConnection.connect(url, commandTimeoutMs);
		return {
			cdp,
			close: async () => {
				cdp.close();
				child.kill();
				await child.exited;
				cleanup();
			},
		};
	} catch (error) {
		child.kill();
		await child.exited;
		cleanup();
		throw error;
	}
}
