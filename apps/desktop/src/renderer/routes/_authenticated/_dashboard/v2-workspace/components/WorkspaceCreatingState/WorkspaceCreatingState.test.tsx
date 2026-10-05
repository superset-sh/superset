import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceCreatingState } from "./WorkspaceCreatingState";

for (const isSession of [true, false]) {
	test(`${isSession ? "session" : "worktree"}: elapsed time cannot advance preparation`, () => {
		const html = renderToStaticMarkup(
			<WorkspaceCreatingState
				isSession={isSession}
				workspaceReady={false}
				startedAt={Date.now() - 60_000}
			/>,
		);
		expect(html).toMatch(
			/aria-current="step"[^>]*>(?:(?!<\/li>)[\s\S])*?<span>Preparing<\/span>/,
		);
		expect(html).not.toContain("Finalizing");
		expect(html).not.toContain("typical");
		expect(html).toContain("Reload window");
	});

	test(`${isSession ? "session" : "worktree"}: workspace readiness advances to startup`, () => {
		const html = renderToStaticMarkup(
			<WorkspaceCreatingState isSession={isSession} workspaceReady />,
		);
		expect(html).toMatch(
			/aria-current="step"[^>]*>(?:(?!<\/li>)[\s\S])*?<span>Starting<\/span>/,
		);
		expect(html).not.toContain("Reload window");
	});
}
