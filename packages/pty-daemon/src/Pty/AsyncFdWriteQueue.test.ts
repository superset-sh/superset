import { describe, expect, test } from "bun:test";
import {
	AsyncFdWriteQueue,
	type FdWrite,
	type FdWriteCallback,
} from "./AsyncFdWriteQueue.ts";

interface PendingCall {
	buffer: Buffer;
	offset: number;
	length: number;
	callback: FdWriteCallback;
}

function deferredWriter(): {
	write: FdWrite;
	calls: PendingCall[];
	active: () => number;
} {
	const calls: PendingCall[] = [];
	let active = 0;
	return {
		calls,
		active: () => active,
		write(_fd, buffer, offset, length, _position, callback) {
			active += 1;
			calls.push({
				buffer,
				offset,
				length,
				callback(err, bytesWritten, returnedBuffer) {
					active -= 1;
					callback(err, bytesWritten, returnedBuffer);
				},
			});
		},
	};
}

async function waitForCall(calls: PendingCall[], count: number): Promise<void> {
	const deadline = Date.now() + 1_000;
	while (calls.length < count && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	expect(calls).toHaveLength(count);
}

function complete(
	call: PendingCall,
	error: NodeJS.ErrnoException | null,
	bytesWritten: number,
): Buffer {
	const written = call.buffer.subarray(call.offset, call.offset + bytesWritten);
	call.callback(error, bytesWritten, call.buffer);
	return written;
}

describe("AsyncFdWriteQueue", () => {
	test("preserves FIFO bytes through EAGAIN, partial, zero, and resumed writes", async () => {
		const writer = deferredWriter();
		const queue = new AsyncFdWriteQueue({
			fd: 7,
			write: writer.write,
			minBackoffMs: 1,
			maxBackoffMs: 2,
		});
		const first = Buffer.from("abcd");
		queue.enqueue(first);
		first.fill(0x7a);
		queue.enqueue(Buffer.from("ef"));

		await waitForCall(writer.calls, 1);
		expect(writer.active()).toBe(1);
		complete(
			writer.calls[0] as PendingCall,
			Object.assign(new Error("again"), { code: "EAGAIN" }),
			0,
		);

		await waitForCall(writer.calls, 2);
		const output: Buffer[] = [];
		output.push(complete(writer.calls[1] as PendingCall, null, 2));
		await waitForCall(writer.calls, 3);
		complete(writer.calls[2] as PendingCall, null, 0);
		await waitForCall(writer.calls, 4);
		output.push(complete(writer.calls[3] as PendingCall, null, 2));
		await waitForCall(writer.calls, 5);
		output.push(complete(writer.calls[4] as PendingCall, null, 2));

		await new Promise((resolve) => setImmediate(resolve));
		expect(writer.active()).toBe(0);
		expect(Buffer.concat(output).toString("utf8")).toBe("abcdef");
		expect(queue.pendingBytes).toBe(0);
	});

	test("rejects the newest buffer atomically above the hard limit", async () => {
		const writer = deferredWriter();
		const queue = new AsyncFdWriteQueue({
			fd: 7,
			write: writer.write,
			maxQueuedBytes: 4,
		});
		queue.enqueue(Buffer.from("abcd"));
		expect(() => queue.enqueue(Buffer.from("e"))).toThrow(
			/input backlog exceeded hard limit/,
		);
		expect(queue.pendingBytes).toBe(4);

		await waitForCall(writer.calls, 1);
		expect(writer.calls[0]?.length).toBe(4);
	});

	test("freezes new input and resolves only after the active queue drains", async () => {
		const writer = deferredWriter();
		const queue = new AsyncFdWriteQueue({ fd: 7, write: writer.write });
		queue.enqueue(Buffer.from("abc"));
		const drained = queue.freezeAndDrain(1_000);
		expect(() => queue.enqueue(Buffer.from("d"))).toThrow(
			/input is frozen for daemon handoff/,
		);

		await waitForCall(writer.calls, 1);
		complete(writer.calls[0] as PendingCall, null, 3);
		await drained;
		queue.unfreeze();
		queue.enqueue(Buffer.from("d"));
		await waitForCall(writer.calls, 2);
	});

	test("ignores a late callback after disposal", async () => {
		const writer = deferredWriter();
		const queue = new AsyncFdWriteQueue({ fd: 7, write: writer.write });
		queue.enqueue(Buffer.from("abc"));
		await waitForCall(writer.calls, 1);
		queue.dispose();
		expect(queue.pendingBytes).toBe(0);
		expect(() => queue.enqueue(Buffer.from("d"))).toThrow(/disposed/);

		// The kernel callback may arrive after fd close. It must be ignored and
		// must not reschedule any queue work.
		complete(writer.calls[0] as PendingCall, null, 3);
		await new Promise((resolve) => setImmediate(resolve));

		expect(queue.pendingBytes).toBe(0);
		expect(writer.calls).toHaveLength(1);
	});

	test("keeps an owned fd alive until a submitted write callback returns", async () => {
		const owners = new Map<number, "A" | "B">([[7, "A"]]);
		const contents = { A: "", B: "" };
		const calls: Array<() => void> = [];
		const closed: number[] = [];
		const write: FdWrite = (
			fd,
			buffer,
			offset,
			length,
			_position,
			callback,
		) => {
			calls.push(() => {
				const owner = owners.get(fd);
				if (!owner) {
					callback(
						Object.assign(new Error("bad file descriptor"), { code: "EBADF" }),
						0,
						buffer,
					);
					return;
				}
				contents[owner] += buffer.subarray(offset, offset + length).toString();
				callback(null, length, buffer);
			});
		};
		const queue = new AsyncFdWriteQueue({
			fd: 7,
			write,
			closeFd(fd) {
				closed.push(fd);
				owners.delete(fd);
			},
		});

		queue.enqueue(Buffer.from("LEAK"));
		const deadline = Date.now() + 1_000;
		while (calls.length < 1 && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 1));
		}
		expect(calls).toHaveLength(1);
		queue.dispose();

		// Model the OS allocating the lowest free descriptor to an unrelated
		// target. Closing fd 7 above would let the delayed write land in B — the
		// original failure reproduced as "LEAKBB" with a real Node worker queue.
		const fdB = owners.has(7) ? 8 : 7;
		owners.set(fdB, "B");
		contents.B = "BB";
		expect(fdB).toBe(8);
		expect(closed).toEqual([]);

		calls[0]?.();
		await new Promise((resolve) => setImmediate(resolve));

		expect(contents).toEqual({ A: "LEAK", B: "BB" });
		expect(closed).toEqual([7]);
	});

	test("stops safely on a closed fd error", async () => {
		const writer = deferredWriter();
		const fatalErrors: Error[] = [];
		const queue = new AsyncFdWriteQueue({
			fd: 7,
			write: writer.write,
			onFatalError: (error) => fatalErrors.push(error),
		});
		queue.enqueue(Buffer.from("abc"));
		await waitForCall(writer.calls, 1);
		complete(
			writer.calls[0] as PendingCall,
			Object.assign(new Error("bad file descriptor"), { code: "EBADF" }),
			0,
		);

		expect(fatalErrors).toHaveLength(1);
		expect(queue.pendingBytes).toBe(0);
		expect(() => queue.enqueue(Buffer.from("d"))).toThrow(
			/bad file descriptor/,
		);
	});
});
