export function shouldWriteInitialCommand(params: {
	initialCommandString: string | null;
	wasRecovered: boolean;
}): boolean {
	return Boolean(params.initialCommandString) && !params.wasRecovered;
}
