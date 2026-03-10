import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { Kbd, KbdGroup } from "@superbuilder/feature-ui/shadcn/kbd";

interface Props {}

export function KbdCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kbd</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/kbd</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Single Keys
          </h4>
          <div className="flex flex-wrap gap-2">
            <Kbd>⌘</Kbd>
            <Kbd>⇧</Kbd>
            <Kbd>⌥</Kbd>
            <Kbd>⌃</Kbd>
            <Kbd>Esc</Kbd>
            <Kbd>Enter</Kbd>
          </div>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Key Combinations
          </h4>
          <div className="flex flex-wrap gap-4">
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>P</Kbd>
            </KbdGroup>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
