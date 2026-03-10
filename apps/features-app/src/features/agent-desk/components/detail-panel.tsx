import { AnimatePresence, motion } from "motion/react";
import { ScreenDetailPanel } from "./screen-detail-panel";
import { EdgeDetailPanel } from "./edge-detail-panel";
import type { FlowScreen, FlowEdge, PanelMode } from "../types";

interface PanelState {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  mode: PanelMode;
  activeTab: string;
  dirty: boolean;
}

interface Props {
  sessionId: string;
  screens: FlowScreen[];
  edges: FlowEdge[];
  panelState: PanelState;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onModeChange: (mode: PanelMode) => void;
  onTabChange: (tab: string) => void;
}

export function DetailPanel({
  sessionId,
  screens,
  edges,
  panelState,
  onClose,
  onDirtyChange,
  onModeChange,
  onTabChange,
}: Props) {
  const isOpen = panelState.mode !== "closed";

  const selectedScreen = panelState.selectedNodeId
    ? screens.find((s) => s.id === panelState.selectedNodeId) ?? null
    : null;

  const selectedEdge = panelState.selectedEdgeId
    ? edges.find((e) => e.id === panelState.selectedEdgeId) ?? null
    : null;

  return (
    <AnimatePresence mode="wait">
      {isOpen ? (
        <motion.div
          key="detail-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 400, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="shrink-0 overflow-hidden rounded-2xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-sm"
        >
          <div className="h-full w-[400px]">
            {selectedScreen ? (
              <ScreenDetailPanel
                sessionId={sessionId}
                screen={selectedScreen}
                mode={panelState.mode}
                activeTab={panelState.activeTab}
                onClose={onClose}
                onModeChange={onModeChange}
                onTabChange={onTabChange}
                onDirtyChange={onDirtyChange}
              />
            ) : null}
            {selectedEdge ? (
              <EdgeDetailPanel
                sessionId={sessionId}
                edge={selectedEdge}
                screens={screens}
                onClose={onClose}
                onDirtyChange={onDirtyChange}
              />
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
