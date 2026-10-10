const handledDrops = new WeakSet<Event>();

export function markDropHandled(event: Event): void {
	handledDrops.add(event);
}

export function isDropHandled(event: Event): boolean {
	return handledDrops.has(event);
}
