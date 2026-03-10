import { toast as sonnerToast } from 'sonner';

export function useToast() {
  return {
    toast: ({
      title,
      description,
      variant = 'default',
    }: {
      title?: string;
      description?: string;
      variant?: 'default' | 'destructive';
    }) => {
      const message = title ? `${title}${description ? ': ' + description : ''}` : description || '';

      if (variant === 'destructive') {
        sonnerToast.error(message);
      } else {
        sonnerToast.success(message);
      }
    },
  };
}
