type TerminalVoiceTargetRegistration = {
	focus?: () => void;
	isReady?: () => boolean;
	label?: string;
	write: (text: string) => boolean;
};

const terminalVoiceTargets = new Map<string, TerminalVoiceTargetRegistration>();

export function registerTerminalVoiceTarget(
	id: string,
	registration: TerminalVoiceTargetRegistration,
): () => void {
	terminalVoiceTargets.set(id, registration);
	return () => {
		if (terminalVoiceTargets.get(id) === registration) {
			terminalVoiceTargets.delete(id);
		}
	};
}

export function getTerminalVoiceTarget(
	id: string,
): TerminalVoiceTargetRegistration | null {
	return terminalVoiceTargets.get(id) ?? null;
}
