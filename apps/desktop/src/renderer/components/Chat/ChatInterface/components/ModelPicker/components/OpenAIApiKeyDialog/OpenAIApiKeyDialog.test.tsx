import { describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Mock dialog to render children directly (Dialog uses portals that don't SSR)
const Passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
mock.module("@superset/ui/dialog", () => ({
	Dialog: Passthrough,
	DialogContent: Passthrough,
	DialogDescription: Passthrough,
	DialogHeader: Passthrough,
	DialogTitle: Passthrough,
}));

const { OpenAIApiKeyDialog } = await import("./OpenAIApiKeyDialog");

describe("OpenAIApiKeyDialog", () => {
	const defaultProps = {
		open: true,
		apiKey: "",
		errorMessage: null,
		isPending: false,
		canClearApiKey: false,
		onOpenChange: () => {},
		onApiKeyChange: () => {},
		onSubmit: () => {},
		onClear: () => {},
	};

	it("should set autoComplete='off' on the API key input to prevent password manager prompts", () => {
		const html = renderToStaticMarkup(<OpenAIApiKeyDialog {...defaultProps} />);
		// The password input must have autocomplete="off" to prevent
		// password managers like 1Password from detecting it (issue #2766)
		expect(html).toContain('autoComplete="off"');
	});
});
