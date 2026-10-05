import { describe, expect, test } from "bun:test";
import path from "node:path";
import picomatch from "picomatch";
import { createIgnoreMatcher } from "./ignore-matcher";

const root = path.resolve("synthetic-repo");
const prefixes = [
	"vendor",
	"packages/p1/build",
	"packages/p1/build/nested",
	".cache",
	"directory with spaces/output",
	"directory/_",
	"nested/_/_",
];
const fallbackGlobs = [
	"**/.git/**",
	"**/node_modules/**",
	"packages/*/generated/**",
	"app/\\[id\\]/**",
	"café/**",
	"café/_/**",
	"app/\\[id\\]/_/**",
	"back\\\\slash/**",
	"./relative/**",
	"double//slash/**",
	"parent/../other/**",
	"{one,two}/**",
	"!(keep)/**",
	"!secret/**",
	"*.tsbuildinfo",
	"**",
];
const candidates = [
	"src/main.ts",
	"packages/p1/building/keep.ts",
	"nested/vendor/keep.ts",
	"packages/p1/generated/out.ts",
	"app/[id]/page.tsx",
	"app/i/page.tsx",
	"node_modules/pkg/index.js",
	"nested/.git/index",
	"café/out.ts",
	"back\\slash/out.ts",
	"relative/out.ts",
	"double/slash/out.ts",
	"other/out.ts",
	"one/out.ts",
	"two/out.ts",
	"keep/out.ts",
	"secret/out.ts",
	"tsconfig.tsbuildinfo",
	"directory",
	"nested/_",
	"café",
	"app/[id]",
	...prefixes.flatMap((prefix) => [
		prefix,
		`${prefix}/file.ts`,
		`${prefix}/.hidden`,
		`${prefix}/deep/file.ts`,
		`${prefix}/line\nbreak.ts`,
		`${prefix}/carriage\rreturn.ts`,
		`${prefix}/line\u2028separator.ts`,
		`${prefix}/paragraph\u2029separator.ts`,
		`${prefix}/**`,
		`${prefix}-sibling/file.ts`,
	]),
];

describe("indexed subtree ignores", () => {
	test("preserves directory-probe matching for an underscore child", () => {
		const ignored = createIgnoreMatcher(root, ["directory/_/**"]);
		expect(ignored(path.join(root, "directory"), true)).toBe(true);
		expect(ignored(path.join(root, "directory"), undefined)).toBe(true);
		expect(ignored(path.join(root, "directory"), false)).toBe(false);
	});

	const subtreeGlobs = prefixes.map((prefix) => `${prefix}/**`);
	for (const globs of [
		subtreeGlobs,
		...subtreeGlobs.map((glob) => [glob]),
		...fallbackGlobs.map((glob) => [...subtreeGlobs, glob]),
		[...subtreeGlobs, ...subtreeGlobs],
	]) {
		test(`agrees with picomatch for ${globs.join(", ")}`, () => {
			const matches = picomatch(globs, { dot: true });
			const ignored = createIgnoreMatcher(root, globs);
			for (const relative of candidates) {
				for (const isDirectory of [true, false, undefined]) {
					const expected =
						matches(relative) ||
						(isDirectory !== false && matches(`${relative}/_`));
					expect(ignored(path.join(root, relative), isDirectory)).toBe(
						expected,
					);
				}
			}
			expect(ignored(root, true)).toBe(false);
			expect(ignored(path.resolve(root, "../elsewhere/vendor"), true)).toBe(
				false,
			);
		});
	}

	test("combines literal paths, indexed subtrees and escaped patterns", () => {
		const ignored = createIgnoreMatcher(root, [
			"literal/path",
			"packages/p1/build/**",
			"app/\\[id\\]/**",
		]);
		for (const relative of [
			"literal/path/a",
			"packages/p1/build/a",
			"app/[id]/a",
		]) {
			expect(ignored(path.join(root, relative), false)).toBe(true);
		}
		for (const relative of [
			"literal/paths/a",
			"packages/p1/building/a",
			"app/i/a",
		]) {
			expect(ignored(path.join(root, relative), false)).toBe(false);
		}
	});

	test("keeps matchers isolated across roots and rebuilt ignore lists", () => {
		const first = createIgnoreMatcher(root, ["vendor/**"]);
		const secondRoot = path.resolve("second-synthetic-repo");
		const second = createIgnoreMatcher(secondRoot, ["build/**"]);
		const refreshed = createIgnoreMatcher(root, ["build/**"]);
		expect(first(path.join(root, "vendor/file.ts"), false)).toBe(true);
		expect(second(path.join(secondRoot, "vendor/file.ts"), false)).toBe(false);
		expect(refreshed(path.join(root, "vendor/file.ts"), false)).toBe(false);
		expect(second(path.join(secondRoot, "build/file.ts"), false)).toBe(true);
	});
});
