import { describe, expect, it } from "bun:test";
import { shouldDisablePanePointerEvents } from "./pointer-events";

describe("shouldDisablePanePointerEvents", () => {
  it("disables pointer events for the pane currently being dragged", () => {
    expect(
      shouldDisablePanePointerEvents({
        draggingPaneId: "pane-a",
        paneId: "pane-a",
        isResizing: false,
      }),
    ).toBe(true);
  });

  it("keeps unrelated panes interactive while another pane is being dragged", () => {
    expect(
      shouldDisablePanePointerEvents({
        draggingPaneId: "pane-a",
        paneId: "pane-b",
        isResizing: false,
      }),
    ).toBe(false);
  });

  it("still disables pointer events while resizing", () => {
    expect(
      shouldDisablePanePointerEvents({
        draggingPaneId: null,
        paneId: "pane-b",
        isResizing: true,
      }),
    ).toBe(true);
  });
});
