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
    as:
      search.as === "foreman" || search.as === "supervisor"
        ? (search.as as Tab)
        : undefined,
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
  const { redirect, as } = Route.useSearch();

  const initial: Tab = as ?? "foreman";
  const [tab, setTab] = useState<Tab>(initial);
  const [username, setUsername] = useState(DEMO_USERS[initial].username);
  const [password, setPassword] = useState(DEMO_USERS[initial].password);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If `?as=` changes (e.g. user clicks Switch user again), follow it.
  useEffect(() => {
    if (as && as !== tab) setTab(as);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [as]);

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

  const tabMeta: Record<Tab, { title: string; description: string; icon: React.ReactNode }> = {
    foreman: {
      title: "Foreman",
      description: "Order materials from the site",
      icon: <HardHat className="size-5" />,
    },
    supervisor: {
      title: "Supervisor",
      description: "Approvals, orders and catalog",
      icon: <ClipboardList className="size-5" />,
    },
  };

  return (
    <div className="min-h-screen dot-bg text-foreground flex flex-col">
      <header className="px-6 h-14 flex items-center gap-2.5 border-b bg-background/80 backdrop-blur">
        <div className="size-8 rounded-md bg-brand text-brand-foreground grid place-items-center">
          <HardHat className="size-5" />
        </div>
        <span className="font-semibold text-sm tracking-tight">comstruct</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Select your role to continue
            </p>
          </div>

          <div className="rounded-xl border bg-card p-1">
            {/* Role selector */}
            <div
              role="tablist"
              aria-label="Role"
              className="grid grid-cols-2 gap-1"
            >
              {(["foreman", "supervisor"] as Tab[]).map((t) => {
                const active = tab === t;
                const meta = tabMeta[t];
                return (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg px-4 py-4 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand text-brand-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    <div className={cn(
                      "size-9 rounded-md grid place-items-center",
                      active ? "bg-brand-foreground/15" : "bg-muted",
                    )}>
                      {meta.icon}
                    </div>
                    <div className="text-center">
                      <div className="font-semibold">{meta.title}</div>
                      <div className={cn(
                        "text-[11px] leading-tight mt-0.5",
                        active ? "text-brand-foreground/80" : "text-muted-foreground",
                      )}>
                        {meta.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Username
              </Label>
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
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Password
              </Label>
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
                className="h-11"
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

            <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            comstruct — construction procurement, simplified.
          </p>
        </div>
      </main>
    </div>
  );
}
