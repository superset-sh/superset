import { describe, expect, test } from "bun:test";
import { findWorkspacesToWake, needsAttention } from "./findWorkspacesToWake";

const NOW = 1_000_000;

describe("findWorkspacesToWake", () => {
	test("wakes a workspace whose time has passed", () => {
		expect(
			findWorkspacesToWake({
				snoozed: [
					{ id: "due", snoozedUntil: NOW },
					{ id: "later", snoozedUntil: NOW + 1 },
				],
				now: NOW,
				attentionById: new Map(),
				previousAttentionById: new Map(),
			}),
		).toEqual(["due"]);
	});

	test("wakes only on new attention, not attention it was snoozed with", () => {
		const snoozed = [
			{ id: "asked", snoozedUntil: NOW + 1 },
			{ id: "still-unread", snoozedUntil: NOW + 1 },
			{ id: "first-seen", snoozedUntil: NOW + 1 },
		];
		expect(
			findWorkspacesToWake({
				snoozed,
				now: NOW,
				attentionById: new Map([
					["asked", true],
					["still-unread", true],
					["first-seen", true],
				]),
				previousAttentionById: new Map([
					["asked", false],
					["still-unread", true],
				]),
			}),
		).toEqual(["asked"]);
	});
});

describe("needsAttention", () => {
	test("counts unread, permission and failed, not working", () => {
		expect(needsAttention({ status: "working", isUnread: false })).toBe(false);
		expect(needsAttention({ status: "permission", isUnread: false })).toBe(
			true,
		);
		expect(needsAttention({ status: "failed", isUnread: false })).toBe(true);
		expect(needsAttention({ status: "review", isUnread: true })).toBe(true);
		expect(needsAttention(undefined)).toBe(false);
	});
});
