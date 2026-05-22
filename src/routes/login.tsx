import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { HardHat, ClipboardList, Loader2 } from "lucide-react";
import { useRole, DEMO_USERS } from "@/lib/role";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "foreman" | "supervisor";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — comstruct" },
      { name: "description", content: "Sign in to comstruct as foreman or supervisor." },
    ],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useRole();
  const { redirect } = Route.useSearch();

  const [tab, setTab] = useState<Tab>("foreman");
  const [username, setUsername] = useState(DEMO_USERS.foreman.username);
  const [password, setPassword] = useState(DEMO_USERS.foreman.password);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Switching tabs swaps in that role's demo credentials.
  useEffect(() => {
    const u = DEMO_USERS[tab];
    setUsername(u.username);
    setPassword(u.password);
    setError(null);
  }, [tab]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    // Small artificial delay so it feels like a real sign-in.
    await new Promise((r) => setTimeout(r, 200));

    const result = signIn(username, password);
    if (!result.ok) {
      setError("Invalid username or password.");
      setSubmitting(false);
      return;
    }

    const dest = redirect ?? (result.role === "foreman" ? "/" : "/procurement");
    navigate({ to: dest });
  }

  const tabMeta: Record<Tab, { title: string; subtitle: string; icon: React.ReactNode }> = {
    foreman: {
      title: "Foreman sign in",
      subtitle: "Order materials from the site in plain language.",
      icon: <HardHat className="size-5" />,
    },
    supervisor: {
      title: "Supervisor sign in",
      subtitle: "Approvals, orders, analytics and catalog.",
      icon: <ClipboardList className="size-5" />,
    },
  };
  const meta = tabMeta[tab];

  return (
    <div className="min-h-screen bg-muted/30 text-foreground flex flex-col">
      <header className="px-6 h-14 flex items-center gap-2">
        <div className="size-8 rounded-md bg-brand text-brand-foreground grid place-items-center">
          <HardHat className="size-5" />
        </div>
        <span className="font-semibold text-sm">comstruct</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Sign in to comstruct</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose your role and continue.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-6">
            {/* Role tabs */}
            <div
              role="tablist"
              aria-label="Role"
              className="grid grid-cols-2 gap-1 p-1 rounded-md bg-muted"
            >
              {(["foreman", "supervisor"] as Tab[]).map((t) => {
                const active = tab === t;
                return (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-card text-foreground border border-border"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t === "foreman" ? (
                      <HardHat className="size-4" />
                    ) : (
                      <ClipboardList className="size-4" />
                    )}
                    <span className="capitalize">{t}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <div className="size-10 rounded-md bg-brand/10 text-brand grid place-items-center">
                {meta.icon}
              </div>
              <div>
                <div className="text-sm font-semibold">{meta.title}</div>
                <div className="text-xs text-muted-foreground">{meta.subtitle}</div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (error) setError(null);
                  }}
                  maxLength={100}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  maxLength={200}
                  required
                />
              </div>

              {error ? (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Demo credentials are pre-filled — just press <span className="font-medium text-foreground">Sign in</span>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
