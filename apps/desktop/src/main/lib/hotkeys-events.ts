import { EventEmitter } from "node:events";

export interface HotkeysStateChangedEvent {
	version: number;
	updatedAt: string;
}

export const hotkeysEmitter = new EventEmitter();
