import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { Slider } from "@superbuilder/feature-ui/shadcn/slider";

interface Props {}

export function SliderCard({}: Props) {
  const [value, setValue] = useState([50]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Slider</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/slider</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Default
          </h4>
          <div className="space-y-2">
            <Slider
              value={value}
              onValueChange={(v) => setValue(Array.isArray(v) ? v : [v])}
            />
            <p className="text-muted-foreground text-sm">Value: {value[0]}</p>
          </div>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Range
          </h4>
          <Slider defaultValue={[25, 75]} />
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Disabled
          </h4>
          <Slider defaultValue={[50]} disabled />
        </section>
      </CardContent>
    </Card>
  );
}
