import { z } from "zod";

export const cursorSchema = z.object({
	epoch: z.string().min(1),
	seq: z.number().int().nonnegative(),
});

export type Cursor = z.infer<typeof cursorSchema>;

export function sameEpoch(a: Cursor, b: Cursor): boolean {
	return a.epoch === b.epoch;
}

export function isAfter(a: Cursor, b: Cursor): boolean {
	if (!sameEpoch(a, b)) throw new Error("cursor epoch mismatch");
	return a.seq > b.seq;
}

export function serializeCursor(cursor: Cursor): string {
	return `${cursor.epoch}:${cursor.seq}`;
}

export function parseCursor(value: string): Cursor {
	const splitAt = value.lastIndexOf(":");
	if (splitAt <= 0) throw new Error("invalid cursor");
	return cursorSchema.parse({
		epoch: value.slice(0, splitAt),
		seq: Number(value.slice(splitAt + 1)),
	});
}
