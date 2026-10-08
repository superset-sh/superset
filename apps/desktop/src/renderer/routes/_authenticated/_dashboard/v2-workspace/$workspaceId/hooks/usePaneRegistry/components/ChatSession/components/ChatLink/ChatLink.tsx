import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import type { ComponentProps } from "react";
import { env } from "renderer/env.renderer";
import { parseSupersetPageUrl } from "renderer/lib/parseSupersetPageUrl";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";

const MarkdownLink = chatMarkdownComponents.a;

export function ChatLink(props: ComponentProps<typeof MarkdownLink>) {
	const { openPage } = useChatPaneActions();
	const { href } = props;
	const isPageLink =
		href !== undefined &&
		parseSupersetPageUrl(href, env.NEXT_PUBLIC_WEB_URL) !== null;

	if (!openPage || !href || !isPageLink) return <MarkdownLink {...props} />;

	return (
		<MarkdownLink
			{...props}
			onClick={(event) => {
				event.preventDefault();
				openPage(href, event);
			}}
		/>
	);
}
