import { describe, expect, it } from "bun:test";
import { TerminalTitleTracker } from "./title-tracker";

const ESC = "\x1b";
const BEL = "\x07";
const ST = `${ESC}\\`;

async function flushXtermWriteQueue(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("TerminalTitleTracker", () => {
	it("tracks xterm native OSC 0 terminal titles", async () => {
		const titles: Array<string | null> = [];
		const tracker = new TerminalTitleTracker((title) => titles.push(title));

		tracker.write(`${ESC}]0;npm test${BEL}`);
		await flushXtermWriteQueue();

		expect(titles).toEqual(["npm test"]);
		expect(tracker.currentTitle).toBe("npm test");
		tracker.dispose();
	});

	it("tracks xterm native OSC 2 window titles with ST terminators", async () => {
		const titles: Array<string | null> = [];
		const tracker = new TerminalTitleTracker((title) => titles.push(title));

		tracker.write(`${ESC}]2;vim src/app.ts${ST}`);
		await flushXtermWriteQueue();

		expect(titles).toEqual(["vim src/app.ts"]);
		expect(tracker.currentTitle).toBe("vim src/app.ts");
		tracker.dispose();
	});

	it("handles xterm parser state across split chunks", async () => {
		const titles: Array<string | null> = [];
		const tracker = new TerminalTitleTracker((title) => titles.push(title));

		tracker.write(`${ESC}]2;long`);
		tracker.write(` task${BEL}`);
		await flushXtermWriteQueue();

		expect(titles).toEqual(["long task"]);
		expect(tracker.currentTitle).toBe("long task");
		tracker.dispose();
	});

	it("tracks ConEmu OSC 9;3 tab-title tokens through xterm parser hooks", async () => {
		const titles: Array<string | null> = [];
		const tracker = new TerminalTitleTracker((title) => titles.push(title));

		tracker.write(`${ESC}]9;3;agent run${BEL}`);
		await flushXtermWriteQueue();

		expect(titles).toEqual(["agent run"]);
		expect(tracker.currentTitle).toBe("agent run");
		tracker.dispose();
	});

	it("normalizes control characters and length for UI display", async () => {
		const titles: Array<string | null> = [];
		const tracker = new TerminalTitleTracker((title) => titles.push(title));
		const longTitle = `${"a".repeat(130)}\n\tb`;

		tracker.write(`${ESC}]2;${longTitle}${BEL}`);
		await flushXtermWriteQueue();

		expect(titles).toEqual(["a".repeat(120)]);
		expect(tracker.currentTitle).toBe("a".repeat(120));
		tracker.dispose();
	});
});
