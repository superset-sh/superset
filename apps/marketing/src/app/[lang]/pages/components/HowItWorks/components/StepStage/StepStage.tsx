import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { LoopStepId } from "../../../../constants";
import { CommentComposer } from "./components/CommentComposer";
import { CommentThread } from "./components/CommentThread";
import { PageWindow } from "./components/PageWindow";
import { PublishCard } from "./components/PublishCard";
import { SharePopover } from "./components/SharePopover";

const OVERLAYS: Record<LoopStepId, () => React.JSX.Element> = {
	create: PublishCard,
	share: SharePopover,
	comment: CommentComposer,
	iterate: CommentThread,
};

export function StepStage({ step }: { step: LoopStepId }) {
	const Overlay = OVERLAYS[step];
	const reducedMotion = useReducedMotion();
	const offset = reducedMotion ? 0 : 8;

	return (
		<div
			aria-hidden="true"
			className="relative order-first min-h-[26rem] overflow-hidden lg:order-last border border-border bg-[radial-gradient(ellipse_at_30%_20%,rgba(232,128,74,0.08),transparent_60%)] p-6 sm:p-10"
		>
			<PageWindow step={step} />
			<AnimatePresence mode="wait">
				<m.div
					key={step}
					initial={{ opacity: 0, y: offset }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: offset }}
					transition={{ duration: reducedMotion ? 0 : 0.25 }}
				>
					<Overlay />
				</m.div>
			</AnimatePresence>
		</div>
	);
}
