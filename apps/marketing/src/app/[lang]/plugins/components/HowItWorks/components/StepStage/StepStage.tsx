import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import type { StepId } from "../../../../constants";
import { AgentRun } from "./components/AgentRun";
import { ConnectCard } from "./components/ConnectCard";
import { PluginWindow } from "./components/PluginWindow";
import { PromptComposer } from "./components/PromptComposer";

const OVERLAYS: Record<StepId, (() => React.JSX.Element) | null> = {
	install: null,
	connect: ConnectCard,
	mention: PromptComposer,
	run: AgentRun,
};

export function StepStage({ step }: { step: StepId }) {
	const Overlay = OVERLAYS[step];
	const reducedMotion = useReducedMotion();
	const offset = reducedMotion ? 0 : 8;

	return (
		<div
			aria-hidden="true"
			className="relative order-first min-h-[26rem] overflow-hidden border border-border bg-[radial-gradient(ellipse_at_30%_20%,rgba(232,128,74,0.08),transparent_60%)] p-6 sm:p-10 lg:order-last"
		>
			<PluginWindow step={step} />
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
