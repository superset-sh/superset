import { atom } from "jotai";
import type { PanelMode } from "../types";

export interface PanelState {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  mode: PanelMode;
  activeTab: string;
  dirty: boolean;
}

const initialPanelState: PanelState = {
  selectedNodeId: null,
  selectedEdgeId: null,
  mode: "closed",
  activeTab: "overview",
  dirty: false,
};

export const panelStateAtom = atom<PanelState>(initialPanelState);
