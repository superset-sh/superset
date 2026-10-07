import { expect, test } from "bun:test";
import { isSuperwhisperProcedureUnavailable } from "./SuperwhisperSettings.utils";

test("hides the setting when an older host lacks the procedure", () => {
	expect(
		isSuperwhisperProcedureUnavailable({
			message: 'No procedure found on path "settings.superwhisper.get"',
		}),
	).toBe(true);
	expect(
		isSuperwhisperProcedureUnavailable({ data: { code: "NOT_FOUND" } }),
	).toBe(true);
});
