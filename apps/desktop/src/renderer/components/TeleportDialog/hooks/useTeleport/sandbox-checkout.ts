interface BootStampLike {
	phase: string;
}

interface HealthLike {
	sandboxBoot?: { stamps: BootStampLike[] } | null;
}

/**
 * The boot runner stamps `checkout.end` once the repository is cloned and on
 * its branch; before that the checkout is being written and a restore into it
 * corrupts both. The phase name is the boot script's, which lives in the
 * sandbox image, not in this repo. A host that is not a sandbox reports no
 * boot and is ready as soon as it answers.
 */
const CHECKOUT_DONE_PHASE = "checkout.end";

export function isSandboxCheckoutReady(health: HealthLike): boolean {
	const boot = health.sandboxBoot;
	if (!boot) return true;
	return boot.stamps.some((stamp) => stamp.phase === CHECKOUT_DONE_PHASE);
}
