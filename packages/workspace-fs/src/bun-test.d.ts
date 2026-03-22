declare module "bun:test" {
	export function afterEach(callback: () => void | Promise<void>): void;

	export function describe(
		name: string,
		callback: () => void | Promise<void>,
	): void;

	export function it(name: string, callback: () => void | Promise<void>): void;

	export function expect<T>(actual: T): {
		toContain(expected: unknown): void;
		toEqual(expected: unknown): void;
		toHaveLength(expected: number): void;
		toBeNull(): void;
		toBeTruthy(): void;
	};
}
