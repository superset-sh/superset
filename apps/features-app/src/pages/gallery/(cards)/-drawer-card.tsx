import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@superbuilder/feature-ui/shadcn/drawer";
import { Button } from "@superbuilder/feature-ui/shadcn/button";

interface Props {}

export function DrawerCard({}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Drawer</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/drawer</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Default (Bottom)
          </h4>
          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerTrigger asChild>
              <Button variant="outline">Open Drawer</Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Drawer Title</DrawerTitle>
                <DrawerDescription>
                  Drawer content slides up from the bottom.
                </DrawerDescription>
              </DrawerHeader>
              <div className="p-4">
                <p className="text-sm">Drawer content goes here.</p>
              </div>
              <DrawerFooter>
                <Button onClick={() => setOpen(false)}>Close</Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </section>
      </CardContent>
    </Card>
  );
}
