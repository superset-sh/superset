import { describe, expect, test } from "bun:test";
import { setTestEnv } from "../../../test/env";

setTestEnv({ NEXT_PUBLIC_API_URL: "https://api.example.com" });

const {
	documentFileRef,
	readLinkSigning,
	referencedFileIds,
	signedDocumentFileUrl,
	toStoredDocument,
} = await import("./document-files");

const scope = { kind: "tasks" as const, id: "task-1" };
const fileId = "0f8fad5b-d9cb-469f-a165-70867728950e";
const signed = `https://acct.r2.cloudflarestorage.com/private/files/${fileId}/original?X-Amz-Signature=abc&X-Amz-Expires=3600`;

describe("document files", () => {
	test("a save turns signed links back into references under the record", () => {
		expect(toStoredDocument(`see ![shot](${signed}) here`, scope)).toBe(
			`see ![shot](https://api.example.com/api/tasks/task-1/files/${fileId}) here`,
		);
	});

	test("finds the files a stored document references, once each", () => {
		const ref = documentFileRef(scope, fileId);
		expect(referencedFileIds(`![a](${ref}) and [b](${ref})`, scope)).toEqual([
			fileId,
		]);
	});

	test("ignores references mounted under another record", () => {
		const other = documentFileRef({ kind: "tasks", id: "task-2" }, fileId);
		expect(referencedFileIds(`![a](${other})`, scope)).toEqual([]);
	});

	test("links read within the same hour are signed alike", () => {
		const early = readLinkSigning(new Date("2026-09-28T10:00:05Z"));
		const late = readLinkSigning(new Date("2026-09-28T10:59:59Z"));
		expect(late.signingDate).toEqual(early.signingDate);
		expect(early.signingDate).toEqual(new Date("2026-09-28T10:00:00Z"));
		expect(
			readLinkSigning(new Date("2026-09-28T11:00:00Z")).signingDate,
		).not.toEqual(early.signingDate);
	});

	test("a link stays valid an hour past the end of its window", () => {
		const now = new Date("2026-09-28T10:59:59Z");
		const { signingDate, expiresInSeconds } = readLinkSigning(now);
		const windowEnd = new Date("2026-09-28T11:00:00Z").getTime();
		expect(
			signingDate.getTime() + expiresInSeconds * 1000 - windowEnd,
		).toBeGreaterThanOrEqual(60 * 60 * 1000);
	});

	test("ids that are not UUIDs open nothing", async () => {
		expect(
			await signedDocumentFileUrl({
				userId: "user-1",
				scope: { kind: "tasks", id: "not-a-uuid" },
				fileId,
			}),
		).toBeNull();
		expect(
			await signedDocumentFileUrl({
				userId: "user-1",
				scope: { kind: "tasks", id: fileId },
				fileId: "../etc",
			}),
		).toBeNull();
	});
});
