import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { RunStepId } from "../../../../constants";
import { AgentMenu } from "./components/AgentMenu";
import { AgentTerminal } from "./components/AgentTerminal";
import { AutomationWindow } from "./components/AutomationWindow";
import { ReviewCard } from "./components/ReviewCard";
import { SchedulePicker } from "./components/SchedulePicker";

const OVERLAYS: Record<RunStepId, () => React.JSX.Element> = {
	write: AgentMenu,
	schedule: SchedulePicker,
	run: AgentTerminal,
	review: ReviewCard,
};

export function StepStage({ step }: { step: RunStepId }) {
	const Overlay = OVERLAYS[step];
	const reducedMotion = useReducedMotion();
	const offset = reducedMotion ? 0 : 8;

	return (
		<div
			aria-hidden="true"
			className="relative order-first min-h-[30rem] overflow-hidden border border-border bg-[radial-gradient(ellipse_at_30%_20%,rgba(232,128,74,0.08),transparent_60%)] px-4 pt-6 pb-52 sm:p-10 lg:order-last"
		>
			<AutomationWindow step={step} />
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
