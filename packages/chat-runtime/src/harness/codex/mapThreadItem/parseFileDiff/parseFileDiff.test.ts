import { describe, expect, test } from "bun:test";
import { parseFileDiff } from "./parseFileDiff";

describe("parseFileDiff", () => {
	test("an added file carries its content as newText with a null oldText", () => {
		expect(parseFileDiff("add", "hi\n")).toEqual({
			oldText: null,
			newText: "hi\n",
		});
	});

	test("a deleted file carries its content as oldText", () => {
		expect(parseFileDiff("delete", "gone\n")).toEqual({
			oldText: "gone\n",
			newText: "",
		});
	});

	test("an update reconstructs both sides from the hunk", () => {
		expect(
			parseFileDiff(
				"update",
				"@@ -1,3 +1,3 @@\n alpha\n-beta\n+BETA\n gamma\n",
			),
		).toEqual({
			oldText: "alpha\nbeta\ngamma\n",
			newText: "alpha\nBETA\ngamma\n",
		});
	});

	test("multiple hunks concatenate in order", () => {
		const diff = [
			"@@ -1,2 +1,2 @@",
			" one",
			"-two",
			"+TWO",
			"@@ -9,2 +9,2 @@",
			" nine",
			"-ten",
			"+TEN",
		].join("\n");

		expect(parseFileDiff("update", diff)).toEqual({
			oldText: "one\ntwo\nnine\nten",
			newText: "one\nTWO\nnine\nTEN",
		});
	});

	test("a no-newline marker is not treated as content", () => {
		expect(
			parseFileDiff(
				"update",
				"@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file",
			),
		).toEqual({ oldText: "a", newText: "b" });
	});

	test("an update without hunk headers is treated as replacement content", () => {
		expect(parseFileDiff("update", "raw contents")).toEqual({
			oldText: null,
			newText: "raw contents",
		});
	});
});
