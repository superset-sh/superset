import { expect, test } from "bun:test";
import path from "node:path";
import { isPackagedModulePath } from "./packaged-module-paths";

for (const paths of [path.posix, path.win32]) {
	test(`packaged containment honors ${paths.sep} boundaries and alternate Windows separators`, () => {
		const root = paths.resolve("accepted", "app.asar");
		expect(
			isPackagedModulePath(
				root,
				paths.join(root, "node_modules/module.js"),
				paths,
			),
		).toBe(true);
		expect(
			isPackagedModulePath(
				root,
				paths.join(root, "../outside/module.js"),
				paths,
			),
		).toBe(false);
		expect(
			isPackagedModulePath(root, `${root}.unpacked/module.js`, paths),
		).toBe(false);
		expect(isPackagedModulePath(root, `${root}-other/module.js`, paths)).toBe(
			false,
		);
		if (paths === path.win32) {
			expect(
				isPackagedModulePath(
					root,
					paths.join(root, "module.js").replaceAll("\\", "/"),
					paths,
				),
			).toBe(true);
			expect(isPackagedModulePath(root, "D:\\outside\\module.js", paths)).toBe(
				false,
			);
		}
	});
}

test("the packaged probe serializes an independently executable containment function", () => {
	const probe = new Function(
		`return (${isPackagedModulePath.toString()})`,
	)() as typeof isPackagedModulePath;
	expect(
		probe(
			"C:\\accepted\\app.asar",
			"C:/accepted/app.asar/module.js",
			path.win32,
		),
	).toBe(true);
	expect(
		probe(
			"C:\\accepted\\app.asar",
			"C:/accepted/outside/module.js",
			path.win32,
		),
	).toBe(false);
});
