// @xterm/headless is CommonJS, and this package is ESM. `import { Terminal }
// from "@xterm/headless"` resolves fine under a bundler and under Bun, then
// throws "Named export 'Terminal' not found" the moment Node loads the
// importing file directly, which is exactly how the `*.node-test.ts` terminal
// integration tests run. Requiring it works under all three, so every headless
// terminal in the host goes through here rather than re-deriving that.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const HeadlessTerminal = (
	require("@xterm/headless") as typeof import("@xterm/headless")
).Terminal;

export type HeadlessTerminal = InstanceType<typeof HeadlessTerminal>;
