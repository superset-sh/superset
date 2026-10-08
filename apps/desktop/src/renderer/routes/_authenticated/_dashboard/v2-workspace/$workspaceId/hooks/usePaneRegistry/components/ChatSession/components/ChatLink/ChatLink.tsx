import { chatMarkdownComponents } from "@superset/chat-ui/ChatMarkdown";
import { cn } from "@superset/ui/utils";
import { type UseNavigateResult, useNavigate } from "@tanstack/react-router";
import type { ComponentProps, MouseEvent } from "react";
import { env } from "renderer/env.renderer";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";
import { unfurlLink } from "../../utils/linkUnfurl";
import { LOCAL_PATH_PREFIX } from "../../utils/remarkLocalPathLinks";
import {
	parseSupersetAppLink,
	type SupersetAppLink,
} from "../../utils/supersetAppLink";
import { LinkUnfurlIcon } from "./components/LinkUnfurlIcon";

const MarkdownLink = chatMarkdownComponents.a;
const UNFURLED_LINK_CLASSNAME =
	"rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-foreground no-underline box-decoration-clone transition-colors hover:bg-foreground/[0.12]";

function openInApp(
	link: Exclude<SupersetAppLink, { kind: "page" }>,
	navigate: UseNavigateResult<string>,
): void {
	switch (link.kind) {
		case "task":
			void navigate({ to: "/tasks/$taskId", params: { taskId: link.taskId } });
			return;
		case "automation":
			void navigate({
				to: "/automations/$automationId",
				params: { automationId: link.automationId },
			});
			return;
		case "plugin":
			void navigate({
				to: "/plugins/$pluginName",
				params: { pluginName: link.pluginName },
			});
			return;
		case "workspace":
			void navigate({
				to: "/cloud-workspaces/$workspaceId",
				params: { workspaceId: link.workspaceId },
			});
	}
}

function withModifier(event: MouseEvent): boolean {
	return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export function ChatLink(props: ComponentProps<typeof MarkdownLink>) {
	const { openPage, openLink } = useChatPaneActions();
	const navigate = useNavigate();
	const isLocalPath = props.href?.startsWith(LOCAL_PATH_PREFIX) ?? false;
	const href = isLocalPath
		? decodeURIComponent(props.href?.slice(LOCAL_PATH_PREFIX.length) ?? "")
		: props.href;

	if (!href) return <MarkdownLink {...props} />;

	const webUrl = env.NEXT_PUBLIC_WEB_URL;
	const appLink = isLocalPath ? null : parseSupersetAppLink(href, webUrl);
	const unfurl = unfurlLink(href, isLocalPath, webUrl);
	const bare =
		typeof props.children === "string" &&
		(props.children === props.href || props.children === href);
	const children = unfurl ? (
		<>
			<LinkUnfurlIcon icon={unfurl.icon} />
			{bare && unfurl.label ? unfurl.label : props.children}
		</>
	) : (
		props.children
	);

	return (
		<MarkdownLink
			{...props}
			className={cn(
				typeof props.className === "string" && props.className,
				unfurl && UNFURLED_LINK_CLASSNAME,
			)}
			onClick={(event) => {
				if (appLink?.kind === "page" && openPage) {
					event.preventDefault();
					openPage(href, event);
					return;
				}
				if (appLink && appLink.kind !== "page" && !withModifier(event)) {
					event.preventDefault();
					openInApp(appLink, navigate);
					return;
				}
				if (openLink?.(href, event) || isLocalPath) event.preventDefault();
			}}
		>
			{children}
		</MarkdownLink>
	);
}
