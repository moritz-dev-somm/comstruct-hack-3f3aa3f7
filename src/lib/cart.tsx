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
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(KEY, JSON.stringify(items));
    }
  }, [items]);

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

  const remove: CartCtx["remove"] = (productId) =>
    setItems((prev) => prev.filter((p) => p.productId !== productId));

  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);

  return (
    <Ctx.Provider value={{ items, add, setQty, remove, subtotal, count, clear: () => setItems([]) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}
