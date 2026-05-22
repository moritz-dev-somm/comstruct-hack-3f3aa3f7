import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SITE_CATEGORIES } from "./catalog";
import type { CartItem } from "./cart";

export type CheckoutAction = "auto_dispatch" | "requires_approval";

export type CustomRule = {
  id: string;
  name: string;
  enabled: boolean;
  when: {
    description?: string;
    supplierIn?: string[];
    categoryIn?: string[];
    minSubtotal?: number;
    maxSubtotal?: number;
  };
  action: CheckoutAction;
};

export type BudgetSettings = {
  /** Global budget cap per order, in EUR. Orders above this need approval. */
  globalBudget: number;
  /** Optional per-category cap. null means "no override". */
  perCategory: Record<string, number | null>;
  customRules: CustomRule[];
};

export type RuleHit = {
  code:
    | "global_budget_exceeded"
    | "category_budget_exceeded"
    | "custom_rule_matched";
  message: string;
  category?: string;
  amount?: number;
  limit?: number;
  ruleId?: string;
};

export type CheckoutDecision = {
  action: CheckoutAction;
  hits: RuleHit[];
  byCategory: Record<string, number>;
  subtotal: number;
};

export const ALL_CATEGORIES = [...SITE_CATEGORIES];

const DEFAULTS: BudgetSettings = {
  globalBudget: 1000,
  perCategory: Object.fromEntries(ALL_CATEGORIES.map((c) => [c, null])),
  customRules: [],
};

const KEY = "comstruct-budget-v2";

function loadFromStorage(): BudgetSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<BudgetSettings>;
    const perCategory: Record<string, number | null> = {
      ...DEFAULTS.perCategory,
      ...(parsed.perCategory ?? {}),
    };
    return {
      globalBudget: parsed.globalBudget ?? DEFAULTS.globalBudget,
      perCategory,
      customRules: parsed.customRules ?? [],
    };
  } catch {
    return DEFAULTS;
  }
}

export function evaluateCheckout(
  items: CartItem[],
  settings: BudgetSettings,
): CheckoutDecision {
  const byCategory: Record<string, number> = {};
  let subtotal = 0;
  for (const it of items) {
    const cat = it.category || "Other";
    const line = it.qty * it.price;
    byCategory[cat] = (byCategory[cat] ?? 0) + line;
    subtotal += line;
  }

  const hits: RuleHit[] = [];

  if (subtotal > settings.globalBudget) {
    hits.push({
      code: "global_budget_exceeded",
      message: `Order exceeds the €${settings.globalBudget.toFixed(0)} budget.`,
      amount: subtotal,
      limit: settings.globalBudget,
    });
  }

  for (const [cat, total] of Object.entries(byCategory)) {
    const cap = settings.perCategory[cat];
    if (typeof cap === "number" && total > cap) {
      hits.push({
        code: "category_budget_exceeded",
        message: `${cat} exceeds its €${cap.toFixed(0)} cap (€${total.toFixed(2)}).`,
        category: cat,
        amount: total,
        limit: cap,
      });
    }
  }

  return {
    action: hits.length > 0 ? "requires_approval" : "auto_dispatch",
    hits,
    byCategory,
    subtotal,
  };
}

type BudgetCtx = {
  settings: BudgetSettings;
  setGlobalBudget: (n: number) => void;
  setCategoryBudget: (category: string, n: number | null) => void;
  addCustomRule: (rule: Omit<CustomRule, "id">) => void;
  updateCustomRule: (id: string, patch: Partial<CustomRule>) => void;
  removeCustomRule: (id: string) => void;
  reset: () => void;
};

const Ctx = createContext<BudgetCtx | null>(null);

export function BudgetProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<BudgetSettings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(loadFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY, JSON.stringify(settings));
  }, [settings, hydrated]);

  const setGlobalBudget = useCallback((n: number) => {
    setSettings((s) => ({ ...s, globalBudget: Math.max(0, n) }));
  }, []);

  const setCategoryBudget = useCallback((category: string, n: number | null) => {
    setSettings((s) => ({ ...s, perCategory: { ...s.perCategory, [category]: n } }));
  }, []);

  const addCustomRule: BudgetCtx["addCustomRule"] = useCallback((rule) => {
    setSettings((s) => ({
      ...s,
      customRules: [...s.customRules, { ...rule, id: crypto.randomUUID() }],
    }));
  }, []);

  const updateCustomRule: BudgetCtx["updateCustomRule"] = useCallback((id, patch) => {
    setSettings((s) => ({
      ...s,
      customRules: s.customRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }, []);

  const removeCustomRule = useCallback((id: string) => {
    setSettings((s) => ({ ...s, customRules: s.customRules.filter((r) => r.id !== id) }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULTS), []);

  const value = useMemo<BudgetCtx>(
    () => ({
      settings,
      setGlobalBudget,
      setCategoryBudget,
      addCustomRule,
      updateCustomRule,
      removeCustomRule,
      reset,
    }),
    [settings, setGlobalBudget, setCategoryBudget, addCustomRule, updateCustomRule, removeCustomRule, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBudget() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBudget outside BudgetProvider");
  return c;
}

export function useCheckoutDecision(items: CartItem[]): CheckoutDecision {
  const { settings } = useBudget();
  return useMemo(() => evaluateCheckout(items, settings), [items, settings]);
}
