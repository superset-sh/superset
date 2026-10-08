import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { BrowserStepId } from "../../../../constants";
import { AgentTerminal } from "./components/AgentTerminal";
import { DesignPrompt } from "./components/DesignPrompt";
import { PaneWindow } from "./components/PaneWindow";
import { PortsCard } from "./components/PortsCard";

const OVERLAYS: Partial<Record<BrowserStepId, () => React.JSX.Element>> = {
	open: PortsCard,
	describe: DesignPrompt,
	verify: AgentTerminal,
};

export function StepStage({ step }: { step: BrowserStepId }) {
	const Overlay = OVERLAYS[step];
	const reducedMotion = useReducedMotion();
	const offset = reducedMotion ? 0 : 8;

	return (
		<div
			aria-hidden="true"
			className="relative order-first min-h-[28rem] lg:min-h-[26rem] overflow-hidden lg:order-last border border-border bg-[radial-gradient(ellipse_at_30%_20%,rgba(232,128,74,0.08),transparent_60%)] p-6 sm:p-10"
		>
			<PaneWindow step={step} />
			<AnimatePresence mode="wait">
				{Overlay && (
					<m.div
						key={step}
						initial={{ opacity: 0, y: offset }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: offset }}
						transition={{ duration: reducedMotion ? 0 : 0.25 }}
					>
						<Overlay />
					</m.div>
				)}
			</AnimatePresence>
		</div>
	);
}
