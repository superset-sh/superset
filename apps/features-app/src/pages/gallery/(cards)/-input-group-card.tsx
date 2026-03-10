import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@superbuilder/feature-ui/shadcn/input-group";
import { MailIcon, SearchIcon, DollarSignIcon } from "lucide-react";

interface Props {}

export function InputGroupCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Input Group</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/input-group</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            With Icon (Start)
          </h4>
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <MailIcon />
            </InputGroupAddon>
            <InputGroupInput placeholder="Email address" />
          </InputGroup>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            With Icon (End)
          </h4>
          <InputGroup>
            <InputGroupInput placeholder="Search..." />
            <InputGroupAddon align="inline-end">
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            With Text
          </h4>
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <DollarSignIcon />
            </InputGroupAddon>
            <InputGroupInput type="number" placeholder="0.00" />
            <InputGroupAddon align="inline-end">USD</InputGroupAddon>
          </InputGroup>
        </section>
      </CardContent>
    </Card>
  );
}
