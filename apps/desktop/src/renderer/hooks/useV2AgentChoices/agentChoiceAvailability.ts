export function isAgentChoiceVisible<
	TView extends {
		health: { installed: boolean | null };
	},
>(capability: TView | undefined): boolean {
	return capability?.health.installed !== false;
}

export function getCapabilityDisplayInventory<TInventory>(
	capability:
		| {
				inventory: TInventory;
				health: { installed: boolean | null };
		  }
		| undefined,
): TInventory | null {
	if (!capability || capability.health.installed === false) return null;
	return capability.inventory;
}
