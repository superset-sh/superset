import { beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const USER_DATA = join(tmpdir(), "superset-test");

mock.module("electron", () => ({
	app: {
		getPath: () => USER_DATA,
		getName: () => "test-app",
		getVersion: () => "1.0.0",
		getAppPath: () => USER_DATA,
		isPackaged: false,
	},
	BrowserWindow: mock(() => ({
		webContents: { send: mock(), setAudioMuted: mock() },
		loadURL: mock(),
		isDestroyed: () => false,
		destroy: mock(),
		on: mock(),
	})),
	session: {
		fromPartition: () => ({
			protocol: { handle: mock(), isProtocolHandled: () => false },
		}),
	},
	protocol: {
		handle: mock(),
		isProtocolHandled: () => false,
		registerSchemesAsPrivileged: mock(),
	},
	dialog: {
		showMessageBox: mock(),
		showOpenDialog: mock(),
		showSaveDialog: mock(),
	},
	ipcMain: { handle: mock(), on: mock() },
	webContents: { fromId: () => null },
	shell: { openExternal: mock(), openPath: mock() },
	clipboard: { writeText: mock(), readText: () => "", writeImage: mock() },
	Menu: {
		buildFromTemplate: mock(() => ({ popup: mock() })),
		setApplicationMenu: mock(),
	},
	Notification: mock(() => ({ show: mock(), on: mock() })),
}));

const {
	ensureThumbnail,
	peekThumbnail,
	THUMBNAIL_SCHEME,
	thumbnailProtocolHandler,
	thumbnailUrl,
} = await import("./pageThumbnails");

const CACHE_DIR = join(USER_DATA, "page-thumbnails");

const ACCOUNT_A = "11111111-1111-1111-1111-111111111111";
const ACCOUNT_B = "22222222-2222-2222-2222-222222222222";
const PAGE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01]);

function pathFor(accountId: string, pageId: string, version: string): string {
	return join(CACHE_DIR, accountId, `${pageId}-${version}.jpg`);
}

async function seed(
	accountId: string,
	pageId: string,
	version: string,
): Promise<string> {
	const path = pathFor(accountId, pageId, version);
	await mkdir(join(CACHE_DIR, accountId), { recursive: true });
	await writeFile(path, JPEG_BYTES);
	return path;
}

function serve(url: string): Promise<Response> {
	return thumbnailProtocolHandler(new Request(url));
}

beforeEach(async () => {
	await rm(CACHE_DIR, { recursive: true, force: true });
});

describe("thumbnailUrl", () => {
	test("scopes the url to the account", () => {
		expect(
			thumbnailUrl({ accountId: ACCOUNT_A, pageId: PAGE, version: "3" }),
		).toBe(`${THUMBNAIL_SCHEME}://${ACCOUNT_A}/${PAGE}/3`);
	});

	test("distinguishes versions of the same page", () => {
		const v3 = thumbnailUrl({
			accountId: ACCOUNT_A,
			pageId: PAGE,
			version: "3",
		});
		const v4 = thumbnailUrl({
			accountId: ACCOUNT_A,
			pageId: PAGE,
			version: "4",
		});
		expect(v3).not.toBe(v4);
	});
});

describe("peekThumbnail", () => {
	test("returns null when nothing is cached", async () => {
		await expect(
			peekThumbnail({ accountId: ACCOUNT_A, pageId: PAGE, version: "1" }),
		).resolves.toBeNull();
	});

	test("returns the url once a thumbnail exists", async () => {
		await seed(ACCOUNT_A, PAGE, "1");
		await expect(
			peekThumbnail({ accountId: ACCOUNT_A, pageId: PAGE, version: "1" }),
		).resolves.toBe(
			thumbnailUrl({ accountId: ACCOUNT_A, pageId: PAGE, version: "1" }),
		);
	});

	test("does not surface another account's thumbnail", async () => {
		await seed(ACCOUNT_A, PAGE, "1");
		await expect(
			peekThumbnail({ accountId: ACCOUNT_B, pageId: PAGE, version: "1" }),
		).resolves.toBeNull();
	});

	test("misses a version that has not been captured", async () => {
		await seed(ACCOUNT_A, PAGE, "3");
		await expect(
			peekThumbnail({ accountId: ACCOUNT_A, pageId: PAGE, version: "4" }),
		).resolves.toBeNull();
	});

	test("cannot escape the account directory via the page id", async () => {
		await seed(ACCOUNT_B, PAGE, "1");
		await expect(
			peekThumbnail({
				accountId: ACCOUNT_A,
				pageId: `../${ACCOUNT_B}/${PAGE}`,
				version: "1",
			}),
		).resolves.toBeNull();
	});

	test("cannot escape the account directory via the account id", async () => {
		await seed(ACCOUNT_B, PAGE, "1");
		await expect(
			peekThumbnail({
				accountId: `../page-thumbnails/${ACCOUNT_B}`,
				pageId: PAGE,
				version: "1",
			}),
		).resolves.toBeNull();
	});

	test("rejects a version that is not a number", async () => {
		await seed(ACCOUNT_A, PAGE, "1");
		await expect(
			peekThumbnail({ accountId: ACCOUNT_A, pageId: PAGE, version: "1.jpg" }),
		).resolves.toBeNull();
	});
});

describe("thumbnailProtocolHandler", () => {
	test("serves a cached thumbnail as an immutable jpeg", async () => {
		await seed(ACCOUNT_A, PAGE, "1");
		const response = await serve(
			`${THUMBNAIL_SCHEME}://${ACCOUNT_A}/${PAGE}/1`,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/jpeg");
		expect(response.headers.get("Cache-Control")).toContain("immutable");
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array(JPEG_BYTES),
		);
	});

	test("404s when the thumbnail is absent", async () => {
		const response = await serve(
			`${THUMBNAIL_SCHEME}://${ACCOUNT_A}/${PAGE}/1`,
		);
		expect(response.status).toBe(404);
	});

	test("will not serve one account's thumbnail to another", async () => {
		await seed(ACCOUNT_A, PAGE, "1");
		const response = await serve(
			`${THUMBNAIL_SCHEME}://${ACCOUNT_B}/${PAGE}/1`,
		);
		expect(response.status).toBe(404);
	});

	test("refuses segments that are not plain identifiers", async () => {
		await seed(ACCOUNT_A, PAGE, "1");
		const dotted = await serve(
			`${THUMBNAIL_SCHEME}://${ACCOUNT_A}/..secrets/1`,
		);
		const encoded = await serve(
			`${THUMBNAIL_SCHEME}://${ACCOUNT_A}/%2e%2e%2fsecrets/1`,
		);
		expect(dotted.status).toBe(404);
		expect(encoded.status).toBe(404);
	});

	test("records access so eviction can order by recency", async () => {
		const path = await seed(ACCOUNT_A, PAGE, "1");
		const stale = new Date(Date.now() - 60_000);
		await utimes(path, stale, stale);
		const before = (await stat(path)).mtimeMs;

		const response = await serve(
			`${THUMBNAIL_SCHEME}://${ACCOUNT_A}/${PAGE}/1`,
		);
		expect(response.status).toBe(200);

		expect((await stat(path)).mtimeMs).toBeGreaterThan(before);
	});
});

describe("ensureThumbnail", () => {
	test("returns the cached url without attempting a capture", async () => {
		await seed(ACCOUNT_A, PAGE, "7");

		await expect(
			ensureThumbnail({
				accountId: ACCOUNT_A,
				pageId: PAGE,
				version: "7",
				html: "<p>never rendered</p>",
			}),
		).resolves.toBe(
			thumbnailUrl({ accountId: ACCOUNT_A, pageId: PAGE, version: "7" }),
		);
	});

	test("refuses a key that would read outside the account directory", async () => {
		await seed(ACCOUNT_B, PAGE, "1");
		await expect(
			ensureThumbnail({
				accountId: ACCOUNT_A,
				pageId: `../${ACCOUNT_B}/${PAGE}`,
				version: "1",
				html: "<p>hi</p>",
			}),
		).rejects.toThrow("Invalid thumbnail key");
	});
});
