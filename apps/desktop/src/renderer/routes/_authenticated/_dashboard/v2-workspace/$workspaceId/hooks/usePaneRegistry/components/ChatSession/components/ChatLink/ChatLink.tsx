import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import type { ComponentProps } from "react";
import { env } from "renderer/env.renderer";
import { parseSupersetPageUrl } from "renderer/lib/parseSupersetPageUrl";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";
import { LOCAL_PATH_PREFIX } from "../../utils/remarkLocalPathLinks";

const MarkdownLink = chatMarkdownComponents.a;

export function ChatLink(props: ComponentProps<typeof MarkdownLink>) {
	const { openPage, openLink } = useChatPaneActions();
	const isLocalPath = props.href?.startsWith(LOCAL_PATH_PREFIX) ?? false;
	const href = isLocalPath
		? decodeURIComponent(props.href?.slice(LOCAL_PATH_PREFIX.length) ?? "")
		: props.href;
	const isPageLink =
		href !== undefined &&
		parseSupersetPageUrl(href, env.NEXT_PUBLIC_WEB_URL) !== null;

	if (!href) return <MarkdownLink {...props} />;

	if (openPage && isPageLink) {
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

	if (!openLink) return <MarkdownLink {...props} />;

	return (
		<MarkdownLink
			{...props}
			onClick={(event) => {
				if (openLink(href, event) || isLocalPath) event.preventDefault();
			}}
		/>
	);
}
