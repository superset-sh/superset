import { EventEmitter } from "node:events";

export interface TabsStateChangedEvent {
	updatedAt: string;
}

export const tabsEmitter = new EventEmitter();
