import { useAtom } from "jotai";
import { panelStateAtom } from "../store/flow-canvas.atoms";
import type { PanelMode } from "../types";

export function useFlowCanvas() {
  const [panelState, setPanelState] = useAtom(panelStateAtom);

  const selectNode = (nodeId: string, mode: "view" | "edit") => {
    setPanelState({
      selectedNodeId: nodeId,
      selectedEdgeId: null,
      mode: mode as PanelMode,
      activeTab: "overview",
      dirty: false,
    });
  };

  const selectEdge = (edgeId: string) => {
    setPanelState({
      selectedNodeId: null,
      selectedEdgeId: edgeId,
      mode: "view",
      activeTab: "transition",
      dirty: false,
    });
  };

  const closePanel = () => {
    setPanelState({
      selectedNodeId: null,
      selectedEdgeId: null,
      mode: "closed",
      activeTab: "overview",
      dirty: false,
    });
  };

  const setDirty = (dirty: boolean) => {
    setPanelState((prev) => ({ ...prev, dirty }));
  };

  const setActiveTab = (tab: string) => {
    setPanelState((prev) => ({ ...prev, activeTab: tab }));
  };

  const setMode = (mode: PanelMode) => {
    setPanelState((prev) => ({ ...prev, mode }));
  };

  return {
    panelState,
    selectNode,
    selectEdge,
    closePanel,
    setDirty,
    setActiveTab,
    setMode,
  };
}
