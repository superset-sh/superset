import { expect, test } from "bun:test";

import { githubHandle } from "./github-handle";

test("githubHandle matches the same profile written differently", () => {
	for (const value of [
		"https://github.com/Foo",
		"http://www.github.com/foo/",
		"github.com/FOO?tab=repositories",
		"foo",
	]) {
		expect(githubHandle(value)).toBe("foo");
	}
	expect(githubHandle("https://gitlab.com/foo")).toBeNull();
});
