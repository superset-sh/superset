/**
 * Tests for MentionPopover / findAtTriggerIndex
 *
 * Issue #2119: Input focus jumps below prompt when typing in new agent session.
 *
 * Root cause: When the user types "@" at the start of a word, MentionProvider opens a
 * Popover with a CommandInput for file search. Radix UI's PopoverContent auto-focuses
 * the CommandInput, stealing focus from the main textarea. When the popup closes, focus
 * is not explicitly returned to the textarea (PopoverContent is missing onCloseAutoFocus).
 *
 * This means:
 * 1. User types "notify @" → mention popup opens → CommandInput receives focus
 * 2. User continues typing → keystrokes go to the popup's search box, not the textarea
 * 3. Popup closes (Escape / file selected) → focus is lost, not returned to textarea
 * 4. Subsequent keystrokes appear in the wrong element (or nowhere)
 *
 * Fix: add onCloseAutoFocus to PopoverContent in MentionProvider so that focus returns
 * to the main textarea ([data-slot=input-group-control]) when the popup closes.
 */
import { describe, expect, it } from "bun:test";
import { findAtTriggerIndex } from "./MentionPopover";

describe("findAtTriggerIndex", () => {
	describe("returns the index of @ when correctly triggered", () => {
		it("detects @ at the start of input (empty prev value)", () => {
			// User types "@" as the very first character
			expect(findAtTriggerIndex("@", "")).toBe(0);
		});

		it("detects @ after a space", () => {
			// User types "hello @" — the @ follows a space
			expect(findAtTriggerIndex("hello @", "hello ")).toBe(6);
		});

		it("detects @ after a newline", () => {
			// User presses Enter then types @
			expect(findAtTriggerIndex("line1\n@", "line1\n")).toBe(6);
		});

		it("detects @ inserted mid-string after a space", () => {
			// User places cursor after "hello " in "hello world" and types @
			expect(findAtTriggerIndex("hello @world", "hello world")).toBe(6);
		});
	});

	describe("returns -1 (no trigger) for non-@ characters", () => {
		it("ignores normal letter input", () => {
			expect(findAtTriggerIndex("hello", "hell")).toBe(-1);
		});

		it("ignores space input", () => {
			expect(findAtTriggerIndex("hello ", "hello")).toBe(-1);
		});

		it("ignores number input", () => {
			expect(findAtTriggerIndex("test1", "test")).toBe(-1);
		});
	});

	describe("returns -1 when @ is not preceded by whitespace or start", () => {
		it("ignores @ directly attached to preceding word characters", () => {
			// "test@" — no space before @, so this is an email address not a mention
			expect(findAtTriggerIndex("test@", "test")).toBe(-1);
		});

		it("ignores @ after a letter mid-word", () => {
			expect(findAtTriggerIndex("a@b", "ab")).toBe(-1);
		});
	});

	describe("returns -1 when more than one character changes at once", () => {
		it("ignores paste of multiple characters (including @)", () => {
			// Pasting "@user" all at once shouldn't trigger the popup
			expect(findAtTriggerIndex("@user", "")).toBe(-1);
		});

		it("ignores deletion (value shrinks)", () => {
			expect(findAtTriggerIndex("hell", "hello")).toBe(-1);
		});

		it("ignores multi-char insertion via autocomplete", () => {
			// Browser autocomplete inserts multiple chars at once
			expect(findAtTriggerIndex("hello @world", "hello")).toBe(-1);
		});

		it("ignores empty-to-empty change", () => {
			expect(findAtTriggerIndex("", "")).toBe(-1);
		});
	});

	describe("edge cases around the trigger condition", () => {
		it("detects @ as the only character when prev is empty", () => {
			expect(findAtTriggerIndex("@", "")).toBe(0);
		});

		it("does NOT trigger when @ is already present and user types after it", () => {
			// User already typed "@" (popup open), now types "r" → searchQuery should update, not re-open
			expect(findAtTriggerIndex("@r", "@")).toBe(-1);
		});
	});
});
