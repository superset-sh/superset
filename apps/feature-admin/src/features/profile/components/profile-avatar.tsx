import { Avatar, AvatarFallback, AvatarImage } from '@superbuilder/feature-ui/shadcn/avatar';
import { cn } from '@superbuilder/feature-ui/lib/utils';

interface ProfileAvatarProps {
  src?: string | null;
  name?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'size-8',
  md: 'size-12',
  lg: 'size-20',
  xl: 'size-32',
};

export function ProfileAvatar({ src, name, size = 'md', className }: ProfileAvatarProps) {
  const initials = name?.charAt(0)?.toUpperCase() || '?';

  return (
    <Avatar className={cn(sizeClasses[size], className)}>
      <AvatarImage src={src ?? undefined} alt={name ?? 'Profile'} />
      <AvatarFallback className="text-lg font-medium">{initials}</AvatarFallback>
    </Avatar>
  );
}
