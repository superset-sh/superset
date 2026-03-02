import { createDragDropManager } from "dnd-core";
import { HTML5Backend } from "react-dnd-html5-backend";

// Single, shared DragDropManager for the entire renderer
export const dragDropManager = createDragDropManager(HTML5Backend);
