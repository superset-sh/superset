export type VoiceActivationTarget = "chat" | "terminal";

export type VoiceActivationResult =
	| { status: "disabled" }
	| {
			status: "unsupported-target";
			reason: "no-supported-target-focused";
	  }
	| { status: "allowed"; target: VoiceActivationTarget };
