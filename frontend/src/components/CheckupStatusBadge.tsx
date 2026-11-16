import { checkupStage, STAGE_CLASS, STAGE_LABEL } from "../lib/checkup";
import type { CheckupSummary } from "../types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function CheckupStatusBadge({ checkup }: { checkup: Pick<CheckupSummary, "status" | "submittedAt"> }) {
  const stage = checkupStage(checkup);
  return <Badge className={cn("border-transparent", STAGE_CLASS[stage])}>{STAGE_LABEL[stage]}</Badge>;
}
