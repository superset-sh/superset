import { mock } from "bun:test";

const mode = process.argv[2];
const writes: unknown[] = [];
const deleted: string[][] = [];
const order: string[] = [];
let releaseCleanup: () => void = () => {};
let cleanupStarted: () => void = () => {};
const cleanupReady = new Promise<void>((resolve) => {
	cleanupStarted = resolve;
});
const cleanupBlocked = new Promise<void>((resolve) => {
	releaseCleanup = resolve;
});
const env = mode?.startsWith("cloud")
	? { STATIC_URL: "https://static.example.test/" }
	: {
			S3_ENDPOINT: "http://storage.local",
			S3_PUBLIC_URL:
				mode === "missing" ? undefined : "https://public.example.test/",
		};
mock.module("../env", () => ({ env }));
mock.module("./r2", () => ({
	putObject: async (args: unknown) => {
		writes.push(args);
		order.push("write");
	},
	deleteObjects: async (keys: string[]) => {
		deleted.push(keys);
		order.push("delete");
		if (mode === "cleanup-wait") {
			cleanupStarted();
			await cleanupBlocked;
		}
		if (mode === "cleanup-fail") throw new Error("owned old cleanup failed");
	},
}));
mock.module("../i18n-error", () => ({
	userError: ({ message }: { message: string }) => new Error(message),
}));
try {
	const upload = await import("./upload");
	if (mode === "repoint") {
		console.log(
			JSON.stringify({
				url: upload.transformUrlFor("user/a/avatar/old/64.webp"),
			}),
		);
		process.exit(0);
	}
	const args = {
		fileData: Buffer.from([0xff, 0xd8, 0xff, 0xff, 0xd9]).toString("base64"),
		pathname: "user/a/avatar/new",
		existingUrl:
			mode === "cloud-replace"
				? "https://static.example.test/cdn-cgi/image/width=256/user/a/avatar/old/original"
				: `https://public.example.test/user/${mode === "other-owner" ? "b" : "a"}/avatar/old/original`,
	};
	if (mode === "cleanup-wait") {
		let returnedBeforeCleanup = false;
		const pending = upload
			.replaceImage({ ...args, save: async () => "saved" })
			.then((result) => {
				returnedBeforeCleanup = true;
				return result;
			});
		await cleanupReady;
		await new Promise<void>((resolve) => setImmediate(resolve));
		const observed = returnedBeforeCleanup;
		releaseCleanup();
		const result = await pending;
		console.log(
			JSON.stringify({
				returnedBeforeCleanup: observed,
				result: result.result,
			}),
		);
		process.exit(0);
	}
	const url = [
		"rollback",
		"replace",
		"other-owner",
		"cloud-replace",
		"cleanup-fail",
	].includes(mode)
		? (
				await upload.replaceImage({
					...args,
					save: async () => {
						order.push("save");
						if (mode === "rollback") throw new Error("row failed");
						return "saved";
					},
				})
			).url
		: await upload.uploadImage(args);
	console.log(JSON.stringify({ url, writes, deleted, order }));
} catch (error) {
	console.log(
		JSON.stringify({
			error: error instanceof Error ? error.message : String(error),
			writes,
			deleted,
			order,
		}),
	);
}
