import { Card, CardContent } from "@superbuilder/feature-ui/shadcn/card";
import { Server, Monitor, Puzzle, Layers } from "lucide-react";

interface Props {
  total: number;
  server: number;
  client: number;
  widget: number;
}

export function CatalogSummary({ total, server, client, widget }: Props) {
  const items = [
    { label: "전체 Feature", value: total, icon: Layers },
    { label: "서버 Feature", value: server, icon: Server },
    { label: "클라이언트", value: client, icon: Monitor },
    { label: "위젯", value: widget, icon: Puzzle },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-md bg-muted p-2">
              <item.icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
