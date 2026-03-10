/**
 * Task List Page - 태스크 목록 페이지 (리스트 + 칸반)
 */
import { useState } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { TaskList } from "../pages";
import { TaskBoard } from "../components/task-board";
import { ViewToggle } from "../components/view-toggle";
import { CreateTaskDialog } from "../components/create-task-dialog";
import type { ViewMode, CardSize, FilterState, SortByField } from "../constants";

const CARD_SIZE_KEY = "task-board-card-size";

function getPersistedCardSize(): CardSize {
  if (typeof window === "undefined") return "compact";
  try {
    const value = localStorage.getItem(CARD_SIZE_KEY);
    return value === "full" ? "full" : "compact";
  } catch {
    return "compact";
  }
}

export function TaskListPage() {
  const search = useSearch({ strict: false }) as { view?: string };
  const navigate = useNavigate();
  const view: ViewMode = search.view === "board" ? "board" : "list";

  const [cardSize, setCardSize] = useState<CardSize>(getPersistedCardSize);

  const [filters, setFilters] = useState<FilterState>({
    statuses: [],
    priorities: [],
    projectId: null,
    labelIds: [],
  });
  const [sortBy, setSortBy] = useState<SortByField>("createdAt");

  const handleViewChange = (newView: ViewMode) => {
    navigate({
      to: "/tasks",
      search: {
        view: newView === "list" ? undefined : newView,
      },
      replace: true,
    });
  };

  const handleCardSizeChange = (size: CardSize) => {
    setCardSize(size);
    try {
      localStorage.setItem(CARD_SIZE_KEY, size);
    } catch {
      // Ignore localStorage write failures (quota exceeded, private mode, etc.)
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Manage and track your tasks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle
            view={view}
            onViewChange={handleViewChange}
            cardSize={cardSize}
            onCardSizeChange={handleCardSizeChange}
          />
          <CreateTaskDialog />
        </div>
      </div>

      {view === "list" ? (
        <div className="rounded-lg border">
          <TaskList
            filters={filters}
            onFiltersChange={setFilters}
            sortBy={sortBy}
            onSortByChange={setSortBy}
          />
        </div>
      ) : (
        <div>
          <div className="rounded-lg border">
            <TaskList
              filters={filters}
              onFiltersChange={setFilters}
              sortBy={sortBy}
              onSortByChange={setSortBy}
              filterBarOnly
              hideSortBy
            />
          </div>
          <div className="mt-3">
            <TaskBoard
              filters={filters}
              cardSize={cardSize}
            />
          </div>
        </div>
      )}
    </div>
  );
}
