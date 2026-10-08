import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import type { ComponentProps } from "react";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";
import { LOCAL_PATH_PREFIX } from "../../utils/remarkLocalPathLinks";

const MarkdownLink = chatMarkdownComponents.a;

export function ChatLink(props: ComponentProps<typeof MarkdownLink>) {
	const { openLink } = useChatPaneActions();
	const href = props.href?.startsWith(LOCAL_PATH_PREFIX)
		? decodeURIComponent(props.href.slice(LOCAL_PATH_PREFIX.length))
		: props.href;

	if (!openLink || !href) return <MarkdownLink {...props} />;

	return (
		<MarkdownLink
			{...props}
			onClick={(event) => {
				if (openLink(href, event)) event.preventDefault();
			}}
		/>
	);
}
