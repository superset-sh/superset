import { describe, expect, it } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import {
	createLeakedInputModeReclaimer,
	KITTY_KEYBOARD_DISARM_SEQUENCE,
} from "shared/leaked-input-mode-reclaim";
import { installInputModeReclaimer } from "./terminalInputModeReclaimer";

// The transport-agnostic decision core (shared). The renderer, and any future
// host-side surface, feed it the same arm/marker events.
describe("createLeakedInputModeReclaimer", () => {
	it("disarms kitty leaked by a dead TUI at the next prompt", () => {
		const r = createLeakedInputModeReclaimer();
		r.noteShellReady(); // session's first prompt
		r.noteArm("kitty", true); // TUI arms kitty after the prompt
		r.noteShellReady(); // shell reprompts after the kill
		expect(r.collectDisarm()).toContain(KITTY_KEYBOARD_DISARM_SEQUENCE);
	});

	it("does not disarm kitty a TUI popped itself on clean exit", () => {
		const r = createLeakedInputModeReclaimer();
		r.noteShellReady();
		r.noteArm("kitty", true);
		r.noteArm("kitty", false); // clean pop
		r.noteShellReady();
		expect(r.collectDisarm()).toBe("");
	});

	it("leaves modes armed by shell init alone (shell-owned)", () => {
		const r = createLeakedInputModeReclaimer();
		r.noteArm("kitty", true); // armed before the first marker → shell owns it
		r.noteShellReady();
		expect(r.collectDisarm()).toBe("");
	});

	it("suppresses the disarm when a TUI re-arms before collection", () => {
		const r = createLeakedInputModeReclaimer();
		r.noteShellReady();
		r.noteArm("kitty", true);
		r.noteShellReady(); // marks kitty leaked
		r.noteArm("kitty", true); // a new TUI grabs it before the flush
		expect(r.collectDisarm()).toBe("");
	});

	it("reclaims leaked mouse and focus reporting", () => {
		const r = createLeakedInputModeReclaimer();
		r.noteShellReady();
		r.noteArm("mouse", true);
		r.noteArm("focus", true);
		r.noteShellReady();
		const out = r.collectDisarm();
		expect(out).toContain("\x1b[?1003l"); // mouse protocol cleared
		expect(out).toContain("\x1b[?1004l"); // focus reporting off
	});

	it("consumes the pending set — a second collect is empty", () => {
		const r = createLeakedInputModeReclaimer();
		r.noteShellReady();
		r.noteArm("kitty", true);
		r.noteShellReady();
		expect(r.collectDisarm()).not.toBe("");
		expect(r.collectDisarm()).toBe("");
	});

	it("writes nothing when no TUI mode leaked", () => {
		const r = createLeakedInputModeReclaimer();
		r.noteShellReady();
		r.noteShellReady();
		expect(r.collectDisarm()).toBe("");
	});
});

// The xterm wiring: parser handlers → core, marker → deferred terminal.write.
describe("installInputModeReclaimer (xterm adapter)", () => {
	type CsiCb = (params: (number | number[])[]) => boolean;
	type OscCb = (data: string) => boolean;

	function makeFakeTerminal() {
		const csi = new Map<string, CsiCb>();
		const osc = new Map<number, OscCb>();
		const writes: string[] = [];
		const terminal = {
			parser: {
				registerCsiHandler(id: { prefix?: string; final: string }, cb: CsiCb) {
					csi.set(`${id.prefix ?? ""}${id.final}`, cb);
					return { dispose() {} };
				},
				registerOscHandler(id: number, cb: OscCb) {
					osc.set(id, cb);
					return { dispose() {} };
				},
			},
			write(data: string) {
				writes.push(data);
			},
		} as unknown as XTerm;
		return {
			terminal,
			writes,
			csi: (key: string, params: (number | number[])[] = []) =>
				csi.get(key)?.(params),
			marker: (data = "superset-shell-ready") => osc.get(777)?.(data),
		};
	}

	const flush = () => new Promise<void>((r) => queueMicrotask(r));

	it("disarms kitty on the marker via a deferred write", async () => {
		const t = makeFakeTerminal();
		installInputModeReclaimer(t.terminal);
		t.marker(); // first prompt
		t.csi(">u", [7]); // kitty arm
		t.marker(); // reprompt after kill
		await flush();
		expect(t.writes.join("")).toContain(KITTY_KEYBOARD_DISARM_SEQUENCE);
	});

	it("ignores OSC 777 payloads that are not the shell-ready marker", async () => {
		const t = makeFakeTerminal();
		installInputModeReclaimer(t.terminal);
		t.marker();
		t.csi(">u", [7]);
		t.marker("notify;something"); // urxvt-style OSC 777, not our marker
		await flush();
		expect(t.writes).toHaveLength(0);
	});
});
