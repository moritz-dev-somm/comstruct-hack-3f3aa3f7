import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  ALL_CATEGORIES,
  useBudget,
  type CheckoutAction,
} from "@/lib/budget";

export function ApprovalRulesContent() {
  const {
    settings,
    setGlobalBudget,
    setCategoryBudget,
    addCustomRule,
    updateCustomRule,
    removeCustomRule,
  } = useBudget();

  return (
    <div className="space-y-8">
      {/* Global budget */}
      <section>
        <SectionHeader
          title="Global budget"
          description="Orders above this amount need PM approval before going to the supplier."
        />
        <div className="rounded-xl border bg-card p-4">
          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Per-order cap (EUR)
          </label>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">€</span>
            <input
              type="number"
              min={0}
              step={50}
              value={settings.globalBudget}
              onChange={(e) => setGlobalBudget(Number(e.target.value) || 0)}
              className="w-40 rounded-md border bg-background px-3 h-11 text-lg font-semibold tabular-nums outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>
        </div>
      </section>

      {/* Per-category */}
      <section>
        <SectionHeader
          title="Per-category caps"
          description="Optional. Leave blank to fall back to the global budget. Any category that exceeds its cap triggers approval."
        />
        <div className="rounded-xl border bg-card divide-y">
          {ALL_CATEGORIES.map((cat) => {
            const value = settings.perCategory[cat];
            return (
              <div
                key={cat}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <span className="font-medium text-sm">{cat}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">€</span>
                  <input
                    type="number"
                    min={0}
                    step={25}
                    placeholder="—"
                    value={value ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCategoryBudget(
                        cat,
                        v === "" ? null : Math.max(0, Number(v) || 0),
                      );
                    }}
                    className="w-28 rounded-md border bg-background px-3 h-10 text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-brand/40"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Custom rules */}
      <section>
        <SectionHeader
          title="Custom rules"
          description="Define additional approval triggers. Rule evaluation will activate in a follow-up — definitions are saved now so you can prepare your policy."
          badge="Preview"
        />
        <div className="rounded-xl border bg-card divide-y">
          {settings.customRules.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">
              No custom rules yet.
            </div>
          )}
          {settings.customRules.map((rule) => (
            <CustomRuleRow
              key={rule.id}
              rule={rule}
              onChange={(patch) => updateCustomRule(rule.id, patch)}
              onRemove={() => removeCustomRule(rule.id)}
            />
          ))}
          <div className="p-3">
            <button
              onClick={() =>
                addCustomRule({
                  name: "New rule",
                  enabled: true,
                  action: "requires_approval",
                  when: { description: "" },
                })
              }
              className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-dashed h-11 text-sm font-medium hover:bg-accent"
            >
              <Plus className="size-4" />
              Add custom rule
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Coming soon: trigger by supplier, time of day, project phase, or
          free-text policy.
        </p>
      </section>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {badge && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
    </div>
  );
}

function CustomRuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: {
    id: string;
    name: string;
    enabled: boolean;
    action: CheckoutAction;
    when: { description?: string };
  };
  onChange: (patch: Partial<{
    name: string;
    enabled: boolean;
    action: CheckoutAction;
    when: { description?: string };
  }>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="size-4 accent-[var(--brand)]"
        />
        <input
          value={rule.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1 bg-transparent text-sm font-medium outline-none"
        />
        <select
          value={rule.action}
          onChange={(e) =>
            onChange({ action: e.target.value as CheckoutAction })
          }
          className="rounded-md border bg-background px-2 h-9 text-xs font-medium"
        >
          <option value="requires_approval">Needs approval</option>
          <option value="auto_dispatch">Auto-dispatch</option>
        </select>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {open ? "Hide" : "Edit"}
        </button>
        <button
          onClick={onRemove}
          aria-label="Remove rule"
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {open && (
        <div className="mt-3 ml-7">
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            Condition (free text · stored, not yet evaluated)
          </label>
          <textarea
            value={rule.when.description ?? ""}
            onChange={(e) =>
              onChange({ when: { ...rule.when, description: e.target.value } })
            }
            rows={2}
            placeholder='e.g. "Hilti orders after 17:00" or "Any single line > €300"'
            className="mt-1 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40"
          />
        </div>
      )}
    </div>
  );
}
