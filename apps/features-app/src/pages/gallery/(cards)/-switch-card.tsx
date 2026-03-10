import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { Switch } from "@superbuilder/feature-ui/shadcn/switch";
import { Label } from "@superbuilder/feature-ui/shadcn/label";

interface Props {}

export function SwitchCard({}: Props) {
  const [enabled, setEnabled] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Switch</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/switch</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Default
          </h4>
          <div className="flex items-center gap-2">
            <Switch
              id="switch-default"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor="switch-default">
              {enabled ? "On" : "Off"}
            </Label>
          </div>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Sizes
          </h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch id="switch-sm" size="sm" />
              <Label htmlFor="switch-sm">Small</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="switch-default-size" size="default" />
              <Label htmlFor="switch-default-size">Default</Label>
            </div>
          </div>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Disabled
          </h4>
          <div className="flex items-center gap-2">
            <Switch id="switch-disabled" disabled />
            <Label htmlFor="switch-disabled">Disabled</Label>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
