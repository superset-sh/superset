import { atom, useAtom } from "jotai";

export type SettingsTab = "general" | "payment" | "ai";

const settingsModalOpenAtom = atom(false);
const settingsTabAtom = atom<SettingsTab>("general");

export function useSettingsModal() {
  const [open, setOpen] = useAtom(settingsModalOpenAtom);
  return { open, setOpen };
}

export function useSettingsTab() {
  const [tab, setTab] = useAtom(settingsTabAtom);
  return { tab, setTab };
}

export { settingsModalOpenAtom, settingsTabAtom };
