declare module "bun:test" {
	export interface MockResult {
		calls: unknown[][];
	}

	export type Mock<T extends (...args: never[]) => unknown> = T & {
		mock: MockResult;
	};

	export function describe(
		name: string,
		callback: () => void | Promise<void>,
	): void;

	export function it(name: string, callback: () => void | Promise<void>): void;

	export function mock<T extends (...args: never[]) => unknown>(fn: T): Mock<T>;

	export function expect<T>(actual: T): {
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
		toBeUndefined(): void;
		toHaveBeenCalledTimes(expected: number): void;
	};
}
