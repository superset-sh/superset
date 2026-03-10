import { atom } from "jotai";
import type { ChatMessage, ThreadInfo } from "../types";

export const currentThreadIdAtom = atom<string | null>(null);
export const messagesAtom = atom<ChatMessage[]>([]);
export const isStreamingAtom = atom(false);
export const threadListAtom = atom<ThreadInfo[]>([]);
export const sidebarOpenAtom = atom(true);
