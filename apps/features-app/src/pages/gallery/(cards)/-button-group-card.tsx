import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { ButtonGroup } from "@superbuilder/feature-ui/shadcn/button-group";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { BoldIcon, ItalicIcon, UnderlineIcon } from "lucide-react";

interface Props {}

export function ButtonGroupCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Button Group</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/button-group</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Horizontal
          </h4>
          <ButtonGroup orientation="horizontal">
            <Button variant="outline">Left</Button>
            <Button variant="outline">Center</Button>
            <Button variant="outline">Right</Button>
          </ButtonGroup>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            With Icons
          </h4>
          <ButtonGroup orientation="horizontal">
            <Button variant="outline" size="icon">
              <BoldIcon />
            </Button>
            <Button variant="outline" size="icon">
              <ItalicIcon />
            </Button>
            <Button variant="outline" size="icon">
              <UnderlineIcon />
            </Button>
          </ButtonGroup>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Vertical
          </h4>
          <ButtonGroup orientation="vertical">
            <Button variant="outline">Top</Button>
            <Button variant="outline">Middle</Button>
            <Button variant="outline">Bottom</Button>
          </ButtonGroup>
        </section>
      </CardContent>
    </Card>
  );
}
