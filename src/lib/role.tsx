import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "foreman" | "supervisor" | null;

export type DemoUser = {
  role: Exclude<Role, null>;
  username: string;
  password: string;
  displayName: string;
};

// Hardcoded demo credentials — this is a demo app with no real backend auth.
// Both roles share the same password for convenience during reviews.
export const DEMO_USERS: Record<Exclude<Role, null>, DemoUser> = {
  foreman: {
    role: "foreman",
    username: "marco.foreman",
    password: "comstruct-demo",
    displayName: "Marco (Foreman)",
  },
  supervisor: {
    role: "supervisor",
    username: "lena.supervisor",
    password: "comstruct-demo",
    displayName: "Lena (Supervisor)",
  },
};

type SignInResult =
  | { ok: true; role: Exclude<Role, null> }
  | { ok: false };

type RoleCtx = {
  role: Role;
  hydrated: boolean;
  setRole: (r: Exclude<Role, null>) => void;
  signIn: (username: string, password: string) => SignInResult;
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

  function signIn(username: string, password: string): SignInResult {
    const u = username.trim().toLowerCase();
    const match = Object.values(DEMO_USERS).find(
      (user) => user.username.toLowerCase() === u && user.password === password,
    );
    if (!match) return { ok: false };
    setRoleState(match.role);
    return { ok: true, role: match.role };
  }

  return (
    <Ctx.Provider
      value={{
        role,
        setRole: (r) => setRoleState(r),
        signIn,
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
