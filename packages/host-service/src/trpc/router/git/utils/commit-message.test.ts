import { describe, expect, test } from "bun:test";
import { isValidCommitHash, splitCommitMessage } from "./commit-message";

describe("splitCommitMessage", () => {
	test("subject-only message has an empty body", () => {
		expect(splitCommitMessage("fix(ui): tighten chip spacing\n")).toEqual({
			subject: "fix(ui): tighten chip spacing",
			body: "",
		});
	});

	test("splits subject from body at the first blank line", () => {
		const raw =
			"feat(landing): peraga cara kerja\n\nContoh Adem diganti marjan.\n";

		expect(splitCommitMessage(raw)).toEqual({
			subject: "feat(landing): peraga cara kerja",
			body: "Contoh Adem diganti marjan.",
		});
	});

	test("preserves blank lines and indentation inside the body", () => {
		const raw = ["subject", "", "para one", "", "  - indented bullet", ""].join(
			"\n",
		);

		expect(splitCommitMessage(raw).body).toBe(
			"para one\n\n  - indented bullet",
		);
	});

	test("keeps trailers, which is where Co-Authored-By lives", () => {
		const raw =
			"subject\n\nwhy this change\n\nCo-Authored-By: Someone <someone@example.com>\n";

		expect(splitCommitMessage(raw).body).toContain(
			"Co-Authored-By: Someone <someone@example.com>",
		);
	});

	test("folds a wrapped subject onto one line, matching %s", () => {
		const raw = "a subject that git\nwrapped across lines\n\nbody\n";

		expect(splitCommitMessage(raw).subject).toBe(
			"a subject that git wrapped across lines",
		);
	});

	test("only the first blank line splits — later ones stay in the body", () => {
		const raw = "subject\n\nfirst\n\nsecond\n";

		expect(splitCommitMessage(raw)).toEqual({
			subject: "subject",
			body: "first\n\nsecond",
		});
	});

	test("handles CRLF line endings", () => {
		expect(splitCommitMessage("subject\r\n\r\nbody line\r\n")).toEqual({
			subject: "subject",
			body: "body line",
		});
	});

	test("empty input yields empty subject and body", () => {
		expect(splitCommitMessage("")).toEqual({ subject: "", body: "" });
	});
});

describe("isValidCommitHash", () => {
	test("accepts short, full, and uppercase hex object names", () => {
		expect(isValidCommitHash("48aa309")).toBe(true);
		expect(isValidCommitHash("b7bc64f4e2c1a09d3f5e8a7b6c4d2e1f0a9b8c7d")).toBe(
			true,
		);
		expect(isValidCommitHash("48AA309")).toBe(true);
	});

	test("rejects flags and revision expressions", () => {
		expect(isValidCommitHash("--output=/tmp/pwned")).toBe(false);
		expect(isValidCommitHash("HEAD~1")).toBe(false);
		expect(isValidCommitHash("HEAD; rm -rf /")).toBe(false);
		expect(isValidCommitHash("feat/sveltekit-studio-db")).toBe(false);
	});

	test("rejects input that is too short or not hex", () => {
		expect(isValidCommitHash("48aa3")).toBe(false);
		expect(isValidCommitHash("")).toBe(false);
		expect(isValidCommitHash("zzzzzzz")).toBe(false);
	});
});
