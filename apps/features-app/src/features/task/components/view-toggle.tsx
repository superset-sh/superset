/**
 * ViewToggle - 리스트/칸반 뷰 전환 + 카드 크기 토글
 */
import { List, Kanban, Rows3, Rows4 } from "lucide-react";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@superbuilder/feature-ui/shadcn/tooltip";
import type { ViewMode, CardSize } from "../constants";

interface Props {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  cardSize: CardSize;
  onCardSizeChange: (size: CardSize) => void;
}

export function ViewToggle({
  view,
  onViewChange,
  cardSize,
  onCardSizeChange,
}: Props) {
  return (
    <div className="flex items-center gap-1">
      {/* View mode toggle */}
      <div className="flex items-center rounded-md border p-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon"
                className="size-7"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => onViewChange("list")}
              />
            }
          >
            <List className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>List view</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant={view === "board" ? "secondary" : "ghost"}
                size="icon"
                className="size-7"
                aria-label="Board view"
                aria-pressed={view === "board"}
                onClick={() => onViewChange("board")}
              />
            }
          >
            <Kanban className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Board view</TooltipContent>
        </Tooltip>
      </div>

      {/* Card size toggle (board view only) */}
      {view === "board" ? (
        <div className="flex items-center rounded-md border p-0.5 ml-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={cardSize === "compact" ? "secondary" : "ghost"}
                  size="icon"
                  className="size-7"
                  aria-label="Compact cards"
                  aria-pressed={cardSize === "compact"}
                  onClick={() => onCardSizeChange("compact")}
                />
              }
            >
              <Rows4 className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Compact</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={cardSize === "full" ? "secondary" : "ghost"}
                  size="icon"
                  className="size-7"
                  aria-label="Full cards"
                  aria-pressed={cardSize === "full"}
                  onClick={() => onCardSizeChange("full")}
                />
              }
            >
              <Rows3 className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Full</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}
