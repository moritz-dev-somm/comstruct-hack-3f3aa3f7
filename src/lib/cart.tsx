import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CartItem = {
  productId: string; // sku
  name: string;
  qty: number;
  price: number; // EUR
  category: string;
  unit: string;
  supplier?: string | null;
};

type CartCtx = {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty"> & { qty?: number }) => void;
  setQty: (productId: string, qty: number) => void;
  adjust: (productId: string, delta: number) => void;
  remove: (productId: string) => void;
  subtotal: number;
  count: number;
  clear: () => void;
};


const Ctx = createContext<CartCtx | null>(null);
const KEY = "comstruct-cart-v2";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const add: CartCtx["add"] = (item) => {
    setItems((prev) => {
      const qty = item.qty ?? 1;
      const found = prev.find((p) => p.productId === item.productId);
      if (found) {
        return prev.map((p) =>
          p.productId === item.productId ? { ...p, qty: p.qty + qty } : p,
        );
      }
      return [...prev, { ...item, qty }];
    });
  };

  const setQty: CartCtx["setQty"] = (productId, qty) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((p) => p.productId !== productId)
        : prev.map((p) => (p.productId === productId ? { ...p, qty } : p)),
    );
  };

  const adjust: CartCtx["adjust"] = (productId, delta) => {
    setItems((prev) => {
      const found = prev.find((p) => p.productId === productId);
      if (!found) return prev;
      const next = found.qty + delta;
      if (next <= 0) return prev.filter((p) => p.productId !== productId);
      return prev.map((p) => (p.productId === productId ? { ...p, qty: next } : p));
    });
  };

  const remove: CartCtx["remove"] = (productId) =>
    setItems((prev) => prev.filter((p) => p.productId !== productId));

  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);

  return (
    <Ctx.Provider value={{ items, add, setQty, adjust, remove, subtotal, count, clear: () => setItems([]) }}>
      {children}
    </Ctx.Provider>
  );

}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}
