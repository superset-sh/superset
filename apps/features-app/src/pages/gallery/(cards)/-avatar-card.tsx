import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarGroup,
} from "@superbuilder/feature-ui/shadcn/avatar";

interface Props {}

export function AvatarCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Avatar</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/avatar</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Sizes
          </h4>
          <div className="flex items-center gap-4">
            <Avatar size="sm">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>SM</AvatarFallback>
            </Avatar>
            <Avatar size="default">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>DF</AvatarFallback>
            </Avatar>
            <Avatar size="lg">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>LG</AvatarFallback>
            </Avatar>
          </div>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Fallback
          </h4>
          <div className="flex items-center gap-4">
            <Avatar>
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
          </div>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Group
          </h4>
          <AvatarGroup>
            <Avatar>
              <AvatarFallback>A</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>B</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>C</AvatarFallback>
            </Avatar>
          </AvatarGroup>
        </section>
      </CardContent>
    </Card>
  );
}
