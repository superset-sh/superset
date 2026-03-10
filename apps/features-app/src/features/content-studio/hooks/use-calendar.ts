import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useCalendarContents(studioId: string, year: number, month: number) {
  const trpc = useTRPC();

  const { data, isLoading } = useQuery(
    trpc.contentStudio.calendarList.queryOptions(
      { studioId, year, month },
      { enabled: !!studioId },
    )
  );

  return { data: data ?? [], isLoading };
}

export function useCalendarMutations(studioId: string, year: number, month: number) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const calendarKey = trpc.contentStudio.calendarList.queryKey({ studioId, year, month });

  const invalidateCalendar = () => queryClient.invalidateQueries({ queryKey: calendarKey });

  const schedule = useMutation(
    trpc.contentStudio.scheduleContent.mutationOptions({ onSuccess: invalidateCalendar })
  );

  const unschedule = useMutation(
    trpc.contentStudio.unscheduleContent.mutationOptions({ onSuccess: invalidateCalendar })
  );

  return { schedule, unschedule };
}
