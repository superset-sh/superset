const killedByUserSessions = new Set<string>();

export const markTerminalKilledByUser = (paneId: string): void => {
	killedByUserSessions.add(paneId);
};

export const isTerminalKilledByUser = (paneId: string): boolean =>
	killedByUserSessions.has(paneId);

export const clearTerminalKilledByUser = (paneId: string): void => {
	killedByUserSessions.delete(paneId);
};
