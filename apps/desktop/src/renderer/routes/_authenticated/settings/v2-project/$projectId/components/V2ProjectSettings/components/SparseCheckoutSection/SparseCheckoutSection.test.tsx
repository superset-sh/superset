import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { SparseCheckoutSection } from "./SparseCheckoutSection";

test("SparseCheckoutSection opens on the host row's folders, one per line", () => {
	const markup = renderToStaticMarkup(
		<QueryClientProvider client={new QueryClient()}>
			<SparseCheckoutSection
				projectId="project-1"
				hostUrl="http://127.0.0.1:7777"
				paths={["apps/desktop", "packages/ui"]}
				onChanged={() => {}}
			/>
		</QueryClientProvider>,
	);

	expect(markup).toContain(">apps/desktop\npackages/ui</textarea>");
});
