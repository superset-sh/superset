import {
	mkdir,
	readdir,
	readFile,
	stat,
	unlink,
	utimes,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import * as electron from "electron";
import {
	PAGE_SCHEME,
	pageProtocolHandler,
	registerPageContent,
	releasePageContent,
} from "../pageContent";

export const THUMBNAIL_SCHEME = "superset-thumb";

const THUMBNAIL_PARTITION = "page-thumbnails";

const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 880;
const THUMBNAIL_WIDTH = 640;
const THUMBNAIL_HEIGHT = 440;
const JPEG_QUALITY = 80;

const MAX_CACHED_THUMBNAILS = 512;
const MAX_CONCURRENT_CAPTURES = 2;

const CAPTURE_DEADLINE_MS = 15_000;
const CAPTURE_ATTEMPT_TIMEOUT_MS = 1_500;
const CAPTURE_RETRY_INTERVAL_MS = 100;
const LOAD_TIMEOUT_MS = 10_000;
const SETTLE_MS = 400;

const ID_PATTERN = /^[a-zA-Z0-9-]+$/;
const VERSION_PATTERN = /^\d+$/;

export interface ThumbnailKey {
	accountId: string;
	pageId: string;
	version: string;
}

function cacheDir(): string {
	return join(electron.app.getPath("userData"), "page-thumbnails");
}

function accountDir(accountId: string): string {
	return join(cacheDir(), accountId);
}

function thumbnailPath({ accountId, pageId, version }: ThumbnailKey): string {
	return join(accountDir(accountId), `${pageId}-${version}.jpg`);
}

export function thumbnailUrl({
	accountId,
	pageId,
	version,
}: ThumbnailKey): string {
	return `${THUMBNAIL_SCHEME}://${accountId}/${pageId}/${version}`;
}

function isValidKey({ accountId, pageId, version }: ThumbnailKey): boolean {
	return (
		ID_PATTERN.test(accountId) &&
		ID_PATTERN.test(pageId) &&
		VERSION_PATTERN.test(version)
	);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error(message)), ms);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

let activeCaptures = 0;
const captureQueue: Array<() => void> = [];

async function acquireCaptureSlot(): Promise<void> {
	if (activeCaptures < MAX_CONCURRENT_CAPTURES) {
		activeCaptures += 1;
		return;
	}
	await new Promise<void>((resolve) => captureQueue.push(resolve));
	activeCaptures += 1;
}

function releaseCaptureSlot(): void {
	activeCaptures -= 1;
	const next = captureQueue.shift();
	if (next) next();
}

async function captureWithRetry(
	window: Electron.BrowserWindow,
): Promise<Electron.NativeImage> {
	const deadline = Date.now() + CAPTURE_DEADLINE_MS;
	let lastError: unknown = null;
	do {
		if (window.isDestroyed()) break;
		try {
			const image = await withTimeout(
				window.webContents.capturePage(),
				CAPTURE_ATTEMPT_TIMEOUT_MS,
				"Thumbnail capture attempt timed out",
			);
			if (!image.isEmpty()) return image;
			lastError = new Error("Thumbnail capture produced an empty image");
		} catch (error) {
			lastError = error;
		}
		await delay(CAPTURE_RETRY_INTERVAL_MS);
	} while (Date.now() < deadline);

	throw lastError instanceof Error
		? lastError
		: new Error("Thumbnail capture failed");
}

const TIMED_OUT = Symbol("timed-out");

const BLANK_PROBE_SIZE = 8;

function isBlank(image: Electron.NativeImage): boolean {
	const bitmap = image
		.resize({
			width: BLANK_PROBE_SIZE,
			height: BLANK_PROBE_SIZE,
			quality: "good",
		})
		.toBitmap();
	if (bitmap.length < 4) return true;
	for (let offset = 4; offset < bitmap.length; offset += 4) {
		if (
			bitmap[offset] !== bitmap[0] ||
			bitmap[offset + 1] !== bitmap[1] ||
			bitmap[offset + 2] !== bitmap[2]
		) {
			return false;
		}
	}
	return true;
}

let partitionReady = false;

function ensurePartitionProtocol(): void {
	if (partitionReady) return;
	partitionReady = true;
	const partition = electron.session.fromPartition(THUMBNAIL_PARTITION);
	if (!partition.protocol.isProtocolHandled(PAGE_SCHEME)) {
		partition.protocol.handle(PAGE_SCHEME, pageProtocolHandler);
	}
}

async function captureHtml(html: string): Promise<Buffer> {
	ensurePartitionProtocol();
	const { token, url } = registerPageContent(html);
	const window = new electron.BrowserWindow({
		show: false,
		paintWhenInitiallyHidden: true,
		width: FRAME_WIDTH,
		height: FRAME_HEIGHT,
		webPreferences: {
			partition: THUMBNAIL_PARTITION,
			backgroundThrottling: false,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			spellcheck: false,
		},
	});

	try {
		window.webContents.setAudioMuted(true);

		const navigation = window
			.loadURL(url)
			.then(() => null)
			.catch((error: unknown) => error);
		const outcome = await Promise.race([
			navigation,
			delay(LOAD_TIMEOUT_MS).then(() => TIMED_OUT),
		]);
		if (outcome && outcome !== TIMED_OUT) {
			throw outcome instanceof Error
				? outcome
				: new Error("Thumbnail page failed to load");
		}

		if (window.isDestroyed()) {
			throw new Error("Thumbnail window closed before capture");
		}
		await delay(SETTLE_MS);
		const image = await captureWithRetry(window);
		if (outcome === TIMED_OUT && isBlank(image)) {
			throw new Error(
				"Thumbnail page had not rendered when the load timed out",
			);
		}
		return image
			.resize({
				width: THUMBNAIL_WIDTH,
				height: THUMBNAIL_HEIGHT,
				quality: "good",
			})
			.toJPEG(JPEG_QUALITY);
	} finally {
		releasePageContent(token);
		if (!window.isDestroyed()) window.destroy();
	}
}

async function listCachedFiles(): Promise<
	Array<{ path: string; mtimeMs: number }>
> {
	const root = cacheDir();
	const accounts = await readdir(root, { withFileTypes: true });
	const perAccount = await Promise.all(
		accounts.map(async (account) => {
			if (!account.isDirectory()) return [];
			const dir = join(root, account.name);
			const names = await readdir(dir).catch(() => [] as string[]);
			const entries = await Promise.all(
				names.map(async (name) => {
					const path = join(dir, name);
					try {
						const info = await stat(path);
						return { path, mtimeMs: info.mtimeMs };
					} catch {
						return null;
					}
				}),
			);
			return entries.filter(
				(entry): entry is { path: string; mtimeMs: number } => Boolean(entry),
			);
		}),
	);
	return perAccount.flat();
}

let pruning = false;

async function pruneCache(): Promise<void> {
	if (pruning) return;
	pruning = true;
	try {
		const files = await listCachedFiles();
		if (files.length <= MAX_CACHED_THUMBNAILS) return;
		const sorted = files.sort((a, b) => a.mtimeMs - b.mtimeMs);
		const excess = sorted.length - MAX_CACHED_THUMBNAILS;
		await Promise.all(
			sorted
				.slice(0, excess)
				.map((entry) => unlink(entry.path).catch(() => undefined)),
		);
	} catch {
		return;
	} finally {
		pruning = false;
	}
}

async function hasThumbnail(key: ThumbnailKey): Promise<boolean> {
	try {
		await stat(thumbnailPath(key));
		return true;
	} catch {
		return false;
	}
}

export async function peekThumbnail(key: ThumbnailKey): Promise<string | null> {
	if (!isValidKey(key)) return null;
	return (await hasThumbnail(key)) ? thumbnailUrl(key) : null;
}

const inflight = new Map<string, Promise<string>>();

export function ensureThumbnail(
	key: ThumbnailKey & { html: string },
): Promise<string> {
	if (!isValidKey(key)) {
		return Promise.reject(new Error("Invalid thumbnail key"));
	}

	const cacheKey = `${key.accountId}:${key.pageId}:${key.version}`;
	const existing = inflight.get(cacheKey);
	if (existing) return existing;

	const pending: Promise<string> = (async () => {
		if (await hasThumbnail(key)) return thumbnailUrl(key);

		await acquireCaptureSlot();
		try {
			const jpeg = await captureHtml(key.html);
			await mkdir(accountDir(key.accountId), { recursive: true });
			await writeFile(thumbnailPath(key), jpeg);
			void pruneCache();
			return thumbnailUrl(key);
		} finally {
			releaseCaptureSlot();
		}
	})().finally(() => {
		if (inflight.get(cacheKey) === pending) inflight.delete(cacheKey);
	});

	inflight.set(cacheKey, pending);
	return pending;
}

export async function thumbnailProtocolHandler(
	request: Request,
): Promise<Response> {
	const url = new URL(request.url);
	const [pageId = "", version = ""] = url.pathname
		.replace(/^\//, "")
		.split("/");
	const key = { accountId: url.hostname, pageId, version };

	if (!isValidKey(key)) {
		return new Response("Not found", { status: 404 });
	}

	const path = thumbnailPath(key);
	try {
		const bytes = await readFile(path);
		const now = new Date();
		await utimes(path, now, now).catch(() => undefined);
		return new Response(new Uint8Array(bytes), {
			status: 200,
			headers: {
				"Content-Type": "image/jpeg",
				"Cache-Control": "public, max-age=31536000, immutable",
			},
		});
	} catch {
		return new Response("Not found", { status: 404 });
	}
}
