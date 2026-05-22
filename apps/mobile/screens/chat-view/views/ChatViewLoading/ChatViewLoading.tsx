import type { LoadingSkeletonDensity } from "@/components/LoadingSkeleton";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { ChatView, type ChatViewProps } from "../../components/ChatView";
import { MOCK_COMPOSER_SETTINGS, MOCK_HEADER } from "../../mock-data";

export type ChatViewLoadingProps = Pick<ChatViewProps, "className"> & {
	density?: LoadingSkeletonDensity;
};

/**
 * UC-SESS-02 §A — chat view loading session history. Header is rendered
 * normally; the body is replaced with the LoadingSkeleton organism; composer
 * is disabled until the snapshot resolves.
 */
export function ChatViewLoading({
	density = "sparse",
	className,
}: ChatViewLoadingProps) {
	return (
		<ChatView
			className={className}
			header={{ ...MOCK_HEADER, status: "paused", statusLabel: "Loading" }}
			body={<LoadingSkeleton density={density} />}
			composer={{
				state: "disabled",
				rowProps: {
					settings: MOCK_COMPOSER_SETTINGS,
					onCommandsPress: () => {},
				},
			}}
		/>
	);
}
