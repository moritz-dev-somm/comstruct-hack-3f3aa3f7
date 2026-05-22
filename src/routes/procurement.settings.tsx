import { createFileRoute } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ApprovalRulesContent } from "@/components/ApprovalRulesContent";
import { useBudget } from "@/lib/budget";

export const Route = createFileRoute("/procurement/settings")({
  component: ProcurementSettingsPage,
  head: () => ({
    meta: [{ title: "Approval rules — comstruct" }],
  }),
});

function ProcurementSettingsPage() {
  const { reset } = useBudget();
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <SlidersHorizontal className="size-6" /> Approval rules
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define the budgets and rules that decide which orders need approval.
          </p>
        </div>
        <button
          onClick={() => {
            reset();
            toast.success("Reset to defaults");
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Reset to defaults
        </button>
      </header>
      <ApprovalRulesContent />
    </div>
  );
}
