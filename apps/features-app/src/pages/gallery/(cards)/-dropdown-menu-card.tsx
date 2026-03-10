import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@superbuilder/feature-ui/shadcn/dropdown-menu";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { UserIcon, SettingsIcon, LogOutIcon } from "lucide-react";

interface Props {}

export function DropdownMenuCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dropdown Menu</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/dropdown-menu</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Default
          </h4>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              Open Menu
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <UserIcon />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <SettingsIcon />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <LogOutIcon />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </section>
      </CardContent>
    </Card>
  );
}
