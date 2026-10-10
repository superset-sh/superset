import { expect, test } from "bun:test";

import { toWebUrl } from "./web-url";

test("toWebUrl keeps web links and refuses other schemes", () => {
	expect(toWebUrl("github.com/foo")).toBe("https://github.com/foo");
	expect(toWebUrl("http://example.com")).toBe("http://example.com");
	expect(toWebUrl("JavaScript:alert(1)")).toBeNull();
	expect(toWebUrl("data:text/html,<script>")).toBeNull();
});
