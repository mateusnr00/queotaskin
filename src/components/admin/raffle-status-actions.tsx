"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { updateRaffleStatusAction } from "@/server/actions/raffles";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "ACTIVE", label: "Ativo" },
  { value: "FINISHED", label: "Encerrado" },
  { value: "CANCELLED", label: "Cancelado" },
] as const;

const STATUS_LABELS = Object.fromEntries(
  STATUSES.map((s) => [s.value, s.label])
);

type StatusValue = (typeof STATUSES)[number]["value"];

interface RaffleStatusActionsProps {
  id: string;
  status: StatusValue;
}

export function RaffleStatusActions({
  id,
  status,
}: RaffleStatusActionsProps) {
  const [isPending, startTransition] = useTransition();

  function onChange(value: string | null) {
    if (!value) return;
    startTransition(async () => {
      const result = await updateRaffleStatusAction({
        id,
        status: value,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Status atualizado");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Status:</span>
      <Select value={status} onValueChange={onChange} disabled={isPending}>
        <SelectTrigger className="w-40">
          <SelectValue labels={STATUS_LABELS} />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
