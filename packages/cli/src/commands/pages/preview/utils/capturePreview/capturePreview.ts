import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CdpConnection } from "../cdp";

export type Theme = "light" | "dark";

export interface Capture {
	width: number;
	theme: Theme;
	path: string;
	pageHeight: number;
	capturedHeight: number;
}

export interface PreviewFindings {
	captures: Capture[];
	consoleErrors: string[];
	blocked: string[];
	overflow: string[];
	sameInBothThemes: number[];
	title: string;
}

export const MAX_CAPTURE_HEIGHT = 1568;
const MAX_IMAGE_BYTES = 1_100_000;
const FONT_WAIT_MS = 2000;

const PROBE = `(async () => {
	await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ${FONT_WAIT_MS}))]);
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	const root = document.documentElement;
	return { height: root.scrollHeight, overflow: root.scrollWidth > root.clientWidth + 1, title: document.title.trim() };
})()`;

const SETTLE = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;

export function viewportHeight(width: number): number {
	return width < 600 ? 844 : 900;
}

function text(params: Record<string, unknown>): string {
	const args =
		(params.args as { value?: unknown; description?: string }[]) ?? [];
	return args
		.map(
			(arg) =>
				arg.description ??
				(typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value)),
		)
		.join(" ");
}

export async function capturePreview({
	cdp,
	wrapperUrl,
	widths,
	themes,
	outDir,
}: {
	cdp: CdpConnection;
	wrapperUrl: string;
	widths: number[];
	themes: Theme[];
	outDir: string;
}): Promise<PreviewFindings> {
	const { targetId } = (await cdp.send("Target.createTarget", {
		url: "about:blank",
	})) as { targetId: string };
	const { sessionId } = (await cdp.send("Target.attachToTarget", {
		targetId,
		flatten: true,
	})) as { sessionId: string };
	const send = (method: string, params: Record<string, unknown> = {}) =>
		cdp.send(method, params, sessionId);

	const findings: PreviewFindings = {
		captures: [],
		consoleErrors: [],
		blocked: [],
		overflow: [],
		sameInBothThemes: [],
		title: "",
	};
	const listen = (
		method: string,
		handle: (params: Record<string, unknown>) => void,
	) =>
		cdp.on(method, (params, from) => {
			if (from === sessionId) handle(params);
		});
	listen("Runtime.consoleAPICalled", (params) => {
		if (params.type === "error" || params.type === "assert") {
			findings.consoleErrors.push(text(params));
		}
	});
	listen("Runtime.exceptionThrown", (params) => {
		const details = params.exceptionDetails as {
			text?: string;
			exception?: { description?: string };
		};
		findings.consoleErrors.push(
			`Uncaught ${details.exception?.description ?? details.text ?? "exception"}`,
		);
	});
	listen("Log.entryAdded", (params) => {
		const entry = params.entry as {
			level: string;
			source: string;
			text: string;
		};
		if (entry.level !== "error") return;
		if (entry.source === "security") findings.blocked.push(entry.text);
		else if (entry.source !== "network" && entry.source !== "intervention") {
			findings.consoleErrors.push(entry.text);
		}
	});

	await send("Page.enable");
	await send("Runtime.enable");
	await send("Log.enable");

	const shots = new Map<string, Buffer>();
	for (const theme of themes) {
		for (const width of widths) {
			await send("Emulation.setDeviceMetricsOverride", {
				width,
				height: viewportHeight(width),
				deviceScaleFactor: 1,
				mobile: false,
			});
			await send("Emulation.setEmulatedMedia", {
				features: [{ name: "prefers-color-scheme", value: theme }],
			});
			await Promise.all([
				cdp.waitFor("Page.loadEventFired", sessionId),
				send("Page.navigate", { url: wrapperUrl }),
			]);

			const { frameTree } = (await send("Page.getFrameTree")) as {
				frameTree: { childFrames?: { frame: { id: string } }[] };
			};
			const frameId = frameTree.childFrames?.[0]?.frame.id;
			if (!frameId) throw new Error("the page frame did not load");
			const { executionContextId } = (await send("Page.createIsolatedWorld", {
				frameId,
				worldName: "superset-preview",
			})) as { executionContextId: number };
			const evaluate = async (expression: string) =>
				(
					(await send("Runtime.evaluate", {
						expression,
						contextId: executionContextId,
						awaitPromise: true,
						returnByValue: true,
					})) as { result: { value: unknown } }
				).result.value;

			const probe = (await evaluate(PROBE)) as {
				height: number;
				overflow: boolean;
				title: string;
			};
			findings.title = probe.title;
			if (probe.overflow) findings.overflow.push(`${width} ${theme}`);
			const capturedHeight = Math.min(probe.height, MAX_CAPTURE_HEIGHT);
			await send("Emulation.setDeviceMetricsOverride", {
				width,
				height: capturedHeight,
				deviceScaleFactor: 1,
				mobile: false,
			});
			await evaluate(SETTLE);

			let image = Buffer.alloc(0);
			for (const quality of [80, 60, 40]) {
				const { data } = (await send("Page.captureScreenshot", {
					format: "jpeg",
					quality,
				})) as { data: string };
				image = Buffer.from(data, "base64");
				if (image.length <= MAX_IMAGE_BYTES) break;
			}
			const index = findings.captures.length + 1;
			const path = join(outDir, `preview-${index}-${width}-${theme}.jpg`);
			writeFileSync(path, image);
			findings.captures.push({
				width,
				theme,
				path,
				pageHeight: probe.height,
				capturedHeight,
			});

			const other = shots.get(
				`${width}:${theme === "light" ? "dark" : "light"}`,
			);
			if (other?.equals(image)) findings.sameInBothThemes.push(width);
			shots.set(`${width}:${theme}`, image);
		}
	}
	await cdp.send("Target.closeTarget", { targetId });
	return findings;
}
