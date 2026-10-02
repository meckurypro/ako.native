// src/hooks/useReports.ts
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface ReportReason {
  id: string;
  label: string;
  description: string | null;
}

/** Active reasons a reporter can pick from — same table the admin
 *  reasons screen manages (see AdminReportReasons.tsx). */
export function useReportReasons() {
  return useQuery({
    queryKey: ["report-reasons"],
    queryFn: async (): Promise<ReportReason[]> => {
      const { data, error } = await supabase
        .from("report_reasons")
        .select("id, label, description")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

interface SubmitReportInput {
  // "project" added on top of the original set — see ReportModal.tsx,
  // which reuses this same hook to let a reporter pick one of a
  // profile's posts or projects specifically, rather than the profile
  // as a whole (that flow is ShareProfileSheet's own "Report" step).
  targetType: "profile" | "post" | "comment" | "project";
  targetId: string;
  reasonId: string;
  details?: string;
}

/** Files a report into the same queue AdminReports.tsx / useResolveReport
 *  already read from — nothing on the moderation side needs to change
 *  for this to show up there. */
export function useSubmitReport() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: SubmitReportInput) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("reports").insert({
        reporter_id: user.id,
        target_type: input.targetType,
        target_id: input.targetId,
        reason_id: input.reasonId,
        details: input.details?.trim() || null,
      });
      if (error) throw error;
    },
  });
}
