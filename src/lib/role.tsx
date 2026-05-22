import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "foreman" | "supervisor" | null;

type RoleCtx = {
  role: Role;
  setRole: (r: Exclude<Role, null>) => void;
  logout: () => void;
};

const Ctx = createContext<RoleCtx | null>(null);
const KEY = "comstruct-role";

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount so SSR and first client render match.
  useEffect(() => {
    const v = localStorage.getItem(KEY);
    if (v === "foreman" || v === "supervisor") setRoleState(v);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (role) localStorage.setItem(KEY, role);
    else localStorage.removeItem(KEY);
  }, [role, hydrated]);

  return (
    <Ctx.Provider
      value={{
        role,
        setRole: (r) => setRoleState(r),
        logout: () => setRoleState(null),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useRole() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRole outside RoleProvider");
  return c;
}
