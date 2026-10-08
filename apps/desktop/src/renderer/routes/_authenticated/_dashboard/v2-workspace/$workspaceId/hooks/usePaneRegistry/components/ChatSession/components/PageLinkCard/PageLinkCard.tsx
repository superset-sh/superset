import { cn } from "@superset/ui/utils";
import { memo, useRef } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useChatPaneActions } from "../../providers/ChatPaneActionsProvider";
import { ChatPageCard } from "./components/ChatPageCard";

/**
 * The card for one page link, or nothing: a page the reader cannot open, a
 * failed lookup, and a lookup still in flight all leave the link as it was.
 */
export const PageLinkCard = memo(function PageLinkCard({
	className,
	slug,
	url,
}: {
	slug: string;
	url: string;
	className?: string;
}) {
	const { openPage } = useChatPaneActions();
	const { data } = cloudTrpc.page.preview.useQuery(
		{ slug },
		{ enabled: openPage !== undefined },
	);
	const knownAtMount = useRef(data !== undefined);

	if (!openPage || data?.status !== "readable") return null;
	return (
		<ChatPageCard
			className={cn(
				!knownAtMount.current &&
					"animate-block-fade motion-reduce:animate-none",
				className,
			)}
			onOpen={(event) => openPage(url, event)}
			page={data.preview}
		/>
	);
});
