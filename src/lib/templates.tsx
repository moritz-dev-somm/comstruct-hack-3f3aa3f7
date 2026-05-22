import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type TemplateItem = {
  sku: string;
  qty: number;
};

export type QuickTemplate = {
  id: string;
  name: string;
  items: TemplateItem[];
  createdAt: string;
};

type TemplatesCtx = {
  templates: QuickTemplate[];
  hydrated: boolean;
  save: (name: string, items: TemplateItem[]) => QuickTemplate;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
};

const Ctx = createContext<TemplatesCtx | null>(null);
const KEY = "comstruct-templates-v1";

export function TemplatesProvider({ children }: { children: ReactNode }) {
  const [templates, setTemplates] = useState<QuickTemplate[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setTemplates(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY, JSON.stringify(templates));
  }, [templates, hydrated]);

  const save: TemplatesCtx["save"] = (name, items) => {
    const tpl: QuickTemplate = {
      id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || "Untitled template",
      items: items.filter((i) => i.qty > 0),
      createdAt: new Date().toISOString(),
    };
    setTemplates((prev) => [tpl, ...prev]);
    return tpl;
  };

  const rename: TemplatesCtx["rename"] = (id, name) =>
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t)));

  const remove: TemplatesCtx["remove"] = (id) =>
    setTemplates((prev) => prev.filter((t) => t.id !== id));

  return (
    <Ctx.Provider value={{ templates, hydrated, save, rename, remove }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTemplates() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTemplates outside TemplatesProvider");
  return c;
}
