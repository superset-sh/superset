import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { NamingInstructionsSection } from "./NamingInstructionsSection";

function renderEditor(instructions: string | null) {
	return renderToStaticMarkup(
		<QueryClientProvider client={new QueryClient()}>
			<NamingInstructionsSection
				projectId="project-1"
				hostUrl="http://127.0.0.1:7777"
				instructions={instructions}
				onChanged={() => {}}
			/>
		</QueryClientProvider>,
	);
}

describe("NamingInstructionsSection", () => {
	test("opens on the host row's instructions", () => {
		expect(renderEditor("Use the ticket id as the branch name")).toContain(
			">Use the ticket id as the branch name</textarea>",
		);
	});

	test("opens empty on a host that has none", () => {
		expect(renderEditor(null)).toContain("></textarea>");
	});
});
