import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  Anchor,
  ArrowUp,
  Bolt,
  Bookmark,
  Check,
  ClipboardList,
  Clock,
  Droplets,
  Hammer,
  HardHat,
  Loader2,
  Package,
  Plus,
  Ruler,
  Search,
  
  ShoppingCart,
  Trash2,
  X,
  Zap,
  LogOut,
  Menu,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useRole } from "@/lib/role";
import { useProducts, formatEUR, type Product } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { useTemplates, type TemplateItem } from "@/lib/templates";
import { useCheckoutDecision, type CheckoutDecision } from "@/lib/budget";
import { useOrders, tierFor, type ApprovalTier, TIER_THRESHOLDS, PM, CENTRAL } from "@/lib/orders";
import { VoiceButton } from "@/components/VoiceButton";

import { ScanButton } from "@/components/ScanButton";
import { ProductImage } from "@/components/ProductImage";
import { HoldButton } from "@/components/HoldButton";
import { QtyInput } from "@/components/QtyInput";
import { LanguageSelector } from "@/components/LanguageSelector";

import { useServerFn } from "@tanstack/react-start";
import { startNegotiationForOrder } from "@/lib/supplier-agent.functions";
import redbullImg from "@/assets/redbull-incentive.jpg";
import comstructLogo from "@/assets/comstruct-logo.png";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  IconTile,
  CompassIcon,
  GearIcon,
  ShovelIcon,
  CraneIcon,
  ConeIcon,
} from "@/components/construction-icons";

const REDBULL_THRESHOLD = 500;

export const Route = createFileRoute("/")({
  component: Home,
  validateSearch: (search: Record<string, unknown>) => ({
    prefill: typeof search.prefill === "string" ? search.prefill : undefined,
  }),
  head: () => ({
    meta: [
      { title: "comstruct — order C-materials in plain language" },
      { name: "description", content: "Chat-first ordering for construction foremen. Describe the job, get the right screws, PPE and consumables." },
    ],
  }),
});

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
};

export type HybridExtracted = {
  extracted_category: string | null;
  extracted_keywords: string[];
  semantic_search_string: string;
};

export type HybridSearchResult = {
  sku: string;
  name: string;
  category: string;
  description: string | null;
  price_eur: number | string;
  unit: string;
  supplier: string | null;
  keywords: string[] | null;
  similarity: number;
  keyword_score: number;
  hybrid_score: number;
};

const SUGGESTED_CHIPS = [
  "PPE pack for a new worker",
  "Drywall screws for metal studs",
  "Window sealing kit",
  "Concrete drilling set",
  "Refill: gloves, masks, blades",
  "SDS bits + plugs for anchors",
];

type CategoryTileData = {
  label: string;
  icon: LucideIcon;
  // Must match the `category` column in the products table exactly so
  // clicking a tile filters the catalog deterministically.
  category: string;
};

// Icon mapping by canonical category name. Unknown categories fall back to
// `Package`. Add new entries here when a category should get a custom glyph,
// but the tile list itself is derived from the products table at runtime.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Fasteners: Bolt,
  Safety: HardHat,
  "Safety / PPE": HardHat,
  PPE: HardHat,
  "Hand Tools": Hammer,
  "Power & Light": Zap,
  Power: Zap,
  Lighting: Zap,
  Sealing: Droplets,
  Adhesives: Droplets,
  Measuring: Ruler,
  Anchors: Anchor,
  Other: Package,
};

function iconForCategory(category: string): LucideIcon {
  return CATEGORY_ICONS[category] ?? Package;
}

function labelForCategory(category: string): string {
  return category === "Safety" ? "Safety / PPE" : category;
}


type QuickOrder = {
  id: string;
  date: string;
  skus: string[]; // real catalog SKUs — resolved against live products at render time
  totalOverride?: string; // optional display total; otherwise computed from products
};

// Demo "past orders" wired to real catalog SKUs so "Add all to cart" actually works.
// SKUs that don't exist in the current catalog are silently skipped.
const QUICK_REORDER_ORDERS: QuickOrder[] = [
  {
    id: "#E-4821",
    date: "12 May 2026",
    // Drywall / finishing: screws + bit + spachtel + tape
    skus: ["C001", "C002", "C032", "C062", "C027"],
  },
  {
    id: "#E-4789",
    date: "03 May 2026",
    // PPE refresh: helmet, gloves, mask, glasses
    skus: ["C073", "C019", "C023", "C021", "C024"],
  },
  {
    id: "#E-4755",
    date: "22 Apr 2026",
    // Anchoring + sealing: dübel + silicone + foam + cleaner
    skus: ["C005", "C006", "C039", "C042", "C076"],
  },
];

const THINKING_WORDS = [
  "Checking the catalog…",
  "Asking the procurement team…",
  "Looking up your project standards…",
  "Comparing suppliers…",
  "Tallying quantities…",
];

function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinkingWord, setThinkingWord] = useState(THINKING_WORDS[0]);
  const [recommendedIds, setRecommendedIds] = useState<string[]>([]);
  const [recommendedQty, setRecommendedQty] = useState<Record<string, number>>({});
  const [followups, setFollowups] = useState<string[]>([]);
  const { data: products = [] } = useProducts();
  const [aMaterialFlag, setAMaterialFlag] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<HybridSearchResult[] | null>(null);
  const [searchExtracted, setSearchExtracted] = useState<HybridExtracted | null>(null);
  const [searching, setSearching] = useState(false);
  const cart = useCart();
  const [project, setProject] = useState("ramistrasse-101");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { role, logout } = useRole();
  const navigate = useNavigate();

  // Root is the login page — if no role is set, send the user there.
  // If a supervisor lands here, route them to their workspace.
  useEffect(() => {
    if (role === null) navigate({ to: "/login" });
    else if (role === "supervisor") navigate({ to: "/procurement" });
  }, [role, navigate]);

  // Early return moved below all hooks to keep hook order stable (fixes React #310).

  const inConversation = messages.length > 0;
  const showCatalog = inConversation || selectedCategory !== null;

  // Tiles derived from the live products table — every distinct `category`
  // value becomes a tile, with a sensible icon fallback. Adding a product
  // with a new category in the DB makes a new tile appear automatically.
  const categoryTiles = useMemo<CategoryTileData[]>(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      if (!p.category) continue;
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([category]) => ({
        category,
        label: labelForCategory(category),
        icon: iconForCategory(category),
      }));
  }, [products]);


  // restore localStorage thread
  useEffect(() => {
    try {
      const saved = localStorage.getItem("comstruct-chat");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.messages) setMessages(parsed.messages);
        if (parsed.recommendedIds) setRecommendedIds(parsed.recommendedIds);
        if (parsed.recommendedQty) setRecommendedQty(parsed.recommendedQty);
      }
    } catch {}
  }, []);

  // Prefill the chat input when arriving from another tab (e.g. the orders
  // page wants to find alternatives for items the agent couldn't source).
  // The /orders "Find alternatives" handler also rewrites `comstruct-chat`
  // beforehand so the prior search context is already loaded by the effect
  // above — here we only seed a clear follow-up turn for the foreman.
  const { prefill } = Route.useSearch();
  useEffect(() => {
    if (!prefill) return;
    setInput(prefill);
    setTimeout(() => inputRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);



  useEffect(() => {
    if (messages.length === 0) return;
    localStorage.setItem(
      "comstruct-chat",
      JSON.stringify({ messages, recommendedIds, recommendedQty }),
    );
  }, [messages, recommendedIds, recommendedQty]);

  // focus input on load and after stream ends
  useEffect(() => {
    if (!streaming) inputRef.current?.focus();
  }, [streaming, inConversation]);

  // auto scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  // Auto-run hybrid catalog search after every completed assistant turn.
  // Each new turn refines the search with the full chat log.
  const lastSearchedTurnRef = useRef(0);
  useEffect(() => {
    if (streaming) return;
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant" || !last.content) return;
    if (!messages.some((m) => m.role === "user")) return;
    if (messages.length === lastSearchedTurnRef.current) return;
    const turnAtCall = messages.length;
    runHybridSearch().then((ok) => {
      // Only mark this turn as searched on success, so failed searches retry on the next effect tick.
      if (ok) lastSearchedTurnRef.current = turnAtCall;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, messages]);


  const sortedProducts = useMemo(() => {
    const filtered = selectedCategory
      ? products.filter((p) => p.category === selectedCategory)
      : products;
    const recSet = new Set(recommendedIds);
    const rec: Product[] = [];
    recommendedIds.forEach((sku) => {
      const p = filtered.find((x) => x.sku === sku);
      if (p) rec.push(p);
    });
    const rest = filtered.filter((p) => !recSet.has(p.sku));
    return [...rec, ...rest];
  }, [recommendedIds, products, selectedCategory]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages([...newHistory, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    setFollowups([]);
    setThinkingWord(THINKING_WORDS[Math.floor(Math.random() * THINKING_WORDS.length)]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newHistory.map((m) => ({ role: m.role, content: m.content })),
          cart: cart.items,
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        toast.error(err || "Something went wrong");
        setStreaming(false);
        setMessages(newHistory); // drop empty assistant
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 2);
          if (!chunk.startsWith("data:")) continue;
          try {
            const evt = JSON.parse(chunk.slice(5).trim());
            handleEvent(evt);
          } catch {}
        }
      }
    } catch (e) {
      toast.error("Connection lost");
      console.error(e);
    } finally {
      setStreaming(false);
    }
  }

  function handleEvent(evt: { type: string; [k: string]: unknown }) {
    switch (evt.type) {
      case "delta": {
        const chunk = evt.content as string;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + chunk };
          }
          return next;
        });
        // Detect inline product tokens as they stream in so the
        // "Recommended for this job" panel below stays in sync.
        const re = /\[\[product:([A-Za-z0-9_-]+)(?::(\d+))?\]\]/g;
        const found: { sku: string; qty: number }[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(chunk)) !== null) {
          found.push({ sku: m[1], qty: m[2] ? parseInt(m[2], 10) : 1 });
        }
        if (found.length) {
          setRecommendedIds((prev) => {
            const set = new Set(prev);
            const add = found.map((f) => f.sku).filter((s) => !set.has(s));
            return add.length ? [...prev, ...add] : prev;
          });
          setRecommendedQty((prev) => {
            const next = { ...prev };
            for (const f of found) next[f.sku] = f.qty;
            return next;
          });
        }
        break;
      }
      case "recommend":
        setRecommendedIds((prev) => {
          const skus = (evt.skus as string[]) ?? [];
          return [...prev, ...skus.filter((s) => !prev.includes(s))];
        });
        break;
      case "tool":
        handleTool(evt.name as string, evt.args as Record<string, unknown>);
        break;
      case "done":
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            const m = last.content.match(FOLLOWUPS_RE);
            if (m) {
              const parts = m[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 2);
              setFollowups(parts);
              next[next.length - 1] = { ...last, content: last.content.replace(FOLLOWUPS_RE, "").trimEnd() };
            } else {
              setFollowups([]);
            }
          }
          return next;
        });
        break;
    }
  }


  function handleTool(name: string, args: Record<string, unknown>) {
    if (name === "flag_as_a_material") {
      setAMaterialFlag((args.what_they_asked_for as string) || "this item");
    }
  }

  // --- Spoken playback for voice-dictated turns ----------------------------
  // When the user dictates with the mic, read the assistant's reply out loud
  // using the browser's built-in SpeechSynthesis. No UI changes.
  const speakNextReplyRef = useRef(false);
  function speakAssistantText(raw: string) {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    // Strip product tokens and markdown so the spoken output is clean.
    const clean = raw
      .replace(/\[\[product:[^\]]+\]\]/g, "")
      .replace(/[`*_#>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.rate = 1.0;
      u.pitch = 1.0;
      synth.speak(u);
    } catch {
      /* ignore */
    }
  }


  function reset() {
    setMessages([]);
    setRecommendedIds([]);
    setRecommendedQty({});
    setFollowups([]);
    setSelectedCategory(null);
    setSearchResults(null);
    setSearchExtracted(null);
    localStorage.removeItem("comstruct-chat");
  }

  function addBundleToCart() {
    let added = 0;
    for (const sku of recommendedIds) {
      const p = products.find((x) => x.sku === sku);
      if (!p) continue;
      const qty = recommendedQty[sku] ?? 1;
      cart.add({
        productId: p.sku,
        name: p.name,
        price: p.price,
        qty,
        category: p.category,
        unit: p.unit,
        supplier: p.supplier,
      });
      added++;
    }
    if (added > 0) {
      toast.success(`Added ${added} item${added === 1 ? "" : "s"} to cart`);
      setCartOpen(true);
    } else {
      toast.info("Nothing to add yet — ask for a recommendation first.");
    }
  }

  const searchSeqRef = useRef(0);
  async function runHybridSearch(): Promise<boolean> {
    if (messages.length === 0) return false;
    const mySeq = ++searchSeqRef.current;
    setSearching(true);
    // Don't clear existing results — we want to keep showing the previous turn's
    // products until the new ones arrive (avoids the "panel disappears" flash).
    try {
      const res = await fetch("/api/hybrid-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const json = await res.json();
      // Ignore stale responses
      if (mySeq !== searchSeqRef.current) return false;
      if (!res.ok) {
        console.error("hybrid-search returned error", res.status, json);
        return false;
      }
      setSearchExtracted(json.extracted ?? null);
      setSearchResults(Array.isArray(json.results) ? json.results : []);
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
      return true;
    } catch (e) {
      console.error("hybrid-search failed", e);
      return false;
    } finally {
      if (mySeq === searchSeqRef.current) setSearching(false);
    }
  }

  if (role !== "foreman") return null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Open menu"
                  className="inline-flex items-center justify-center size-10 rounded-full border hover:bg-accent"
                >
                  <Menu className="size-4" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <div className="mt-6 flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-muted-foreground">Current site</label>
                    <Select
                      value={project}
                      onValueChange={(v) => {
                        setProject(v);
                        setMenuOpen(false);
                      }}
                    >
                      <SelectTrigger className="h-10 w-full text-sm border-border">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ramistrasse-101">Rämistrasse 101</SelectItem>
                        <SelectItem value="bahnhofstrasse-42">Bahnhofstrasse 42</SelectItem>
                        <SelectItem value="langstrasse-77">Langstrasse 77</SelectItem>
                        <SelectItem value="sechselautenplatz-1">Sechseläutenplatz 1</SelectItem>
                        <SelectItem value="limmatquai-150">Limmatquai 150</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Link
                    to="/orders"
                    onClick={() => setMenuOpen(false)}
                    className="inline-flex items-center gap-2 rounded-full border px-4 h-11 text-sm font-medium hover:bg-accent"
                  >
                    <ClipboardList className="size-4" />
                    My orders
                  </Link>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                      navigate({ to: "/login" });
                    }}
                    className="inline-flex items-center gap-2 rounded-full border px-4 h-11 text-sm font-medium hover:bg-accent"
                  >
                    <LogOut className="size-4" />
                    Switch user
                  </button>
                </div>
              </SheetContent>
            </Sheet>
            <button
              onClick={reset}
              aria-label="comstruct home"
              className="shrink-0 hover:opacity-80 transition-opacity"
            >
              <img
                src={comstructLogo}
                alt="comstruct"
                className="h-8 w-auto"
              />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <LanguageSelector />
            <button
              onClick={() => setCartOpen(true)}
              className="relative inline-flex items-center gap-2 rounded-full border px-3 h-10 text-sm font-medium hover:bg-accent"
            >
              <ShoppingCart className="size-4" />
              <span>{formatEUR(cart.subtotal)}</span>
              {cart.count > 0 && (
                <span className="absolute -top-1 -right-1 size-5 rounded-full bg-brand text-brand-foreground text-[10px] font-bold grid place-items-center">
                  {cart.count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>


      <main className="flex-1 flex flex-col">
        {!showCatalog ? (
          <HeroView
            categoryTiles={categoryTiles}
            input={input}
            setInput={setInput}
            send={send}
            onSelectCategory={setSelectedCategory}
            inputRef={inputRef}
            onAddQuickOrder={(skus) => {
              let added = 0;
              for (const sku of skus) {
                const product = products.find((p) => p.sku === sku);
                if (product) {
                  cart.add({
                    productId: product.sku,
                    name: product.name,
                    price: product.price,
                    category: product.category,
                    unit: product.unit,
                    qty: 1,
                    supplier: product.supplier,
                  });
                  added++;
                }
              }
              if (added > 0) {
                toast.success(`Added ${added} item${added === 1 ? "" : "s"} to cart`);
                setCartOpen(true);
              } else {
                toast.info("No matching products found in catalog");
              }
            }}
            onAddTemplate={(items) => {
              let added = 0;
              for (const it of items) {
                const product = products.find((p) => p.sku === it.sku);
                if (product) {
                  cart.add({
                    productId: product.sku,
                    name: product.name,
                    price: product.price,
                    category: product.category,
                    unit: product.unit,
                    qty: it.qty,
                    supplier: product.supplier,
                  });
                  added++;
                }
              }
              if (added > 0) {
                toast.success(`Added ${added} item${added === 1 ? "" : "s"} to cart`);
                setCartOpen(true);
              } else {
                toast.info("No matching products found in catalog");
              }
            }}
            products={products}
          />

        ) : (
          <ConversationView
            messages={messages}
            streaming={streaming}
            thinkingWord={thinkingWord}
            scrollRef={scrollRef}
            sortedProducts={sortedProducts}
            recommendedIds={recommendedIds}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            onClearCategory={() => setSelectedCategory(null)}
            onResetRecommendations={() => { setRecommendedIds([]); setRecommendedQty({}); }}
            onAddBundle={addBundleToCart}
            onSuggestion={(s) => send(s)}
            followups={followups}
            allProducts={products}
            categoryTiles={categoryTiles}
            onRunSearch={runHybridSearch}
            searching={searching}
            searchResults={searchResults}
            searchExtracted={searchExtracted}
          />

        )}
      </main>

      {/* Fixed close-chat button — always visible at top-left while in a conversation */}
      {showCatalog && (
        <button
          onClick={reset}
          aria-label="Close chat"
          className="fixed top-20 left-4 z-40 grid size-10 place-items-center rounded-full border bg-background/95 backdrop-blur hover:bg-accent text-foreground"
        >
          <X className="size-5" />
        </button>
      )}

      {/* Fixed bottom bar in conversation mode: chat input + separate, distinct voice button */}
      {inConversation && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-3xl px-4 py-3 flex items-end gap-3">
            <div className="flex-1">
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={() => send(input)}
                disabled={streaming}
                inputRef={inputRef}
                placeholder="Ask a follow-up…"
              />
            </div>
            <ScanButton size="compact" onResult={(prompt) => send(prompt)} />
            <VoiceButton size="compact" onTranscript={(t) => send(t)} />
            <VoiceModeButton
              size="compact"
              onUserTranscript={appendVoiceUserTurn}
              onAssistantTranscript={appendVoiceAssistantTurn}
            />
          </div>
        </div>
      )}

      {/* Approval banner — driven by budget/rules decision */}
      <ApprovalBanner />


      {/* A-material modal */}
      {aMaterialFlag && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
          <div className="bg-card rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-semibold text-lg">That's an A-material</h3>
            <p className="text-sm text-muted-foreground mt-2">
              "{aMaterialFlag}" is handled by your project manager through the main procurement flow. Want me to ping them?
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                className="px-4 h-10 rounded-md text-sm font-medium hover:bg-accent"
                onClick={() => setAMaterialFlag(null)}
              >
                Never mind
              </button>
              <button
                className="px-4 h-10 rounded-md bg-brand text-brand-foreground text-sm font-semibold"
                onClick={() => {
                  toast.success("PM notified");
                  setAMaterialFlag(null);
                }}
              >
                Notify PM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} />}
    </div>
  );
}

function HeroView({
  input,
  setInput,
  send,
  onSelectCategory,
  inputRef,
  onAddQuickOrder,
  onAddTemplate,
  categoryTiles,
  products,
  onVoiceUserTurn,
  onVoiceAssistantTurn,
}: {
  input: string;
  setInput: (v: string) => void;
  send: (v: string) => void;
  onSelectCategory: (c: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onAddQuickOrder: (skus: string[]) => void;
  onAddTemplate: (items: TemplateItem[]) => void;
  categoryTiles: CategoryTileData[];
  products: Product[];
  onVoiceUserTurn: (text: string) => void;
  onVoiceAssistantTurn: (text: string) => void;
}) {
  const { templates, hydrated: tplHydrated, remove: removeTemplate } = useTemplates();
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-center">
          Do you need site supplies?
        </h1>
        <p className="mt-3 text-center text-muted-foreground">
          Order PPE, gloves, masks, batteries, drill bits, screws, sealants and other small tools — fast.
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground/80">
          C-materials only. For concrete, doors, windows or other A-materials, talk to your PM.
        </p>


        {/* Primary action CTAs — voice (brand) + scan (grey), visually distinct */}
        <div className="mt-8 flex justify-center items-start gap-8">
          <VoiceButton size="hero" onTranscript={(t) => send(t)} />
          <VoiceModeButton
            size="hero"
            onUserTranscript={onVoiceUserTurn}
            onAssistantTranscript={onVoiceAssistantTurn}
          />
          <ScanButton size="hero" onResult={(prompt) => send(prompt)} />
        </div>

        <div className="my-6 h-px bg-border" />

        <div>
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => send(input)}
            disabled={false}
            inputRef={inputRef}
            placeholder="Describe the job…"
            big
          />
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {SUGGESTED_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => send(chip)}
              className="rounded-full border border-brand text-brand hover:bg-brand/10 px-3 h-8 text-xs font-medium"
            >
              {chip}
            </button>
          ))}
        </div>

        <div className="mt-10">
          <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase tracking-wide">
            <div className="flex-1 h-px bg-border" />
            or browse by category
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {categoryTiles.map((c) => (
              <CategoryTile key={c.category} tile={c} onSelect={() => onSelectCategory(c.category)} />
            ))}
          </div>
        </div>

        {/* Your saved templates — foreman-defined quick-buy bundles */}
        {tplHydrated && templates.length > 0 && products.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase tracking-wide">
              <div className="flex-1 h-px bg-border" />
              your templates
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="mt-4 space-y-3">
              {templates.map((tpl) => {
                const resolved = tpl.items
                  .map((it) => {
                    const p = products.find((p) => p.sku === it.sku);
                    return p ? { product: p, qty: it.qty } : null;
                  })
                  .filter((x): x is { product: Product; qty: number } => Boolean(x));
                if (resolved.length === 0) return null;
                const total = `€${resolved.reduce((s, r) => s + r.product.price * r.qty, 0).toFixed(2)}`;
                const names = resolved.map((r) => `${r.qty}× ${r.product.name}`);
                return (
                  <div
                    key={tpl.id}
                    className="w-full rounded-xl border bg-card p-4 transition-colors hover:border-brand/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-semibold truncate">
                          <Bookmark className="size-3.5 shrink-0 text-brand" />
                          {tpl.name}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {resolved.length} item{resolved.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <span className="text-sm font-semibold shrink-0">{total}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground line-clamp-2">
                      {names.slice(0, 3).join(" · ")}
                      {names.length > 3 && ` · +${names.length - 3} more`}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() =>
                          onAddTemplate(resolved.map((r) => ({ sku: r.product.sku, qty: r.qty })))
                        }
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <ShoppingCart className="size-3.5" />
                        Add all to cart
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete template "${tpl.name}"?`)) removeTemplate(tpl.id);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Delete template"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Reorder — demo orders wired to real catalog SKUs */}
        {products.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase tracking-wide">
              <div className="flex-1 h-px bg-border" />
              quick reorder
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="mt-4 space-y-3">
              {QUICK_REORDER_ORDERS.map((order) => {
                const resolved = order.skus
                  .map((sku) => products.find((p) => p.sku === sku))
                  .filter((p): p is Product => Boolean(p));
                if (resolved.length === 0) return null;
                const total =
                  order.totalOverride ??
                  `€${resolved.reduce((sum, p) => sum + p.price, 0).toFixed(2)}`;
                const names = resolved.map((p) => p.name);
                return (
                  <div
                    key={order.id}
                    className="w-full rounded-xl border bg-card p-4 transition-colors hover:border-brand/40"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">{order.id}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="size-3.5" />
                          {order.date}
                        </div>
                      </div>
                      <span className="text-sm font-semibold">{total}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {names.slice(0, 3).join(" · ")}
                      {names.length > 3 && ` · +${names.length - 3} more`}
                    </div>
                    <button
                      onClick={() => onAddQuickOrder(resolved.map((p) => p.sku))}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <ShoppingCart className="size-3.5" />
                      Add all to cart
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Decorative icon row — SubBase-style colored tiles, anchored at bottom */}
        <div className="mt-12 flex items-center justify-center gap-3 flex-wrap">
          <IconTile icon={CompassIcon} tone="brand" size="sm" />
          <IconTile icon={CraneIcon} tone="dark" size="sm" />
          <IconTile icon={GearIcon} tone="light" size="sm" />
          <IconTile icon={ShovelIcon} tone="brand" size="sm" />
          <IconTile icon={ConeIcon} tone="outline" size="sm" />
        </div>
      </div>
    </div>
  );
}

function CategoryTile({
  tile,
  onSelect,
}: {
  tile: CategoryTileData;
  onSelect: () => void;
}) {
  const Icon = tile.icon;
  return (
    <button
      onClick={onSelect}
      className="group flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-4 aspect-square text-center transition-colors hover:bg-accent hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <span className="grid size-12 place-items-center rounded-lg bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
        <Icon className="size-6" strokeWidth={2} />
      </span>
      <span className="text-xs font-semibold leading-tight">{tile.label}</span>
    </button>
  );
}

function ConversationView({
  messages,
  streaming,
  thinkingWord,
  scrollRef,
  sortedProducts,
  recommendedIds,
  selectedCategory,
  onSelectCategory,
  onClearCategory,
  onResetRecommendations,
  onAddBundle,
  onSuggestion,
  followups,
  allProducts,
  onRunSearch,
  searching,
  searchResults,
  searchExtracted,
  categoryTiles,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  thinkingWord: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  sortedProducts: Product[];
  recommendedIds: string[];
  selectedCategory: string | null;
  onSelectCategory: (c: string) => void;
  onClearCategory: () => void;
  onResetRecommendations: () => void;
  onAddBundle: () => void;
  onSuggestion: (s: string) => void;
  followups: string[];
  allProducts: Product[];
  onRunSearch: () => void;
  searching: boolean;
  searchResults: HybridSearchResult[] | null;
  searchExtracted: HybridExtracted | null;
  categoryTiles: CategoryTileData[];
}) {
  const recSet = new Set(recommendedIds);
  const lastAssistant = messages[messages.length - 1]?.role === "assistant" ? messages[messages.length - 1] : null;
  const isThinking = streaming && (!lastAssistant || lastAssistant.content === "");

  // When no explicit category filter is active, show ONLY the recommended
  // picks above, then the same category-tile grid as the landing page.
  // When a category tile is clicked, fall back to the full filtered catalog.
  const showTilesLayout = !selectedCategory;
  const recommendedProducts = recommendedIds
    .map((sku) => allProducts.find((p) => p.sku === sku))
    .filter((p): p is Product => !!p);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4 pb-32">
        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} products={allProducts} />
        ))}
        {isThinking && (
          <div className="text-sm text-muted-foreground italic flex items-center gap-2">
            <span className="size-2 rounded-full bg-brand animate-pulse" />
            {thinkingWord}
          </div>
        )}

        {/* suggestions */}
        {!streaming && lastAssistant && (
          <div className="flex flex-wrap gap-2 pt-1">
            {recommendedProducts.length > 0 && (
              <SuggestionButton onClick={onAddBundle}>
                Add the bundle to cart
              </SuggestionButton>
            )}
            {followups.map((f) => (
              <SuggestionButton key={f} onClick={() => onSuggestion(f)}>
                {f}
              </SuggestionButton>
            ))}
          </div>
        )}

      </div>

      {/* Hybrid catalog search results — refreshed after every assistant turn */}
      {(searching || (searchResults && searchResults.length > 0)) && (
        <div className="border-t bg-muted/20">
          <div className="mx-auto max-w-5xl px-4 py-6">
            <div className="flex items-end justify-between mb-4 border-b-2 border-brand/70 pb-2 gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-brand flex items-center gap-2">
                  <Search className="size-5" />
                  Matching catalog items
                  {searching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                </h2>
                {searchExtracted && (searchExtracted.extracted_category || searchExtracted.extracted_keywords?.length) && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {searchExtracted.extracted_category && (
                      <span className="font-medium">{searchExtracted.extracted_category}</span>
                    )}
                    {searchExtracted.extracted_category && searchExtracted.extracted_keywords?.length ? " · " : ""}
                    {searchExtracted.extracted_keywords?.slice(0, 6).join(", ")}
                  </p>
                )}
              </div>
              {searchResults && (
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  Top {Math.min(searchResults.length, 6)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(searchResults ?? []).slice(0, 6).map((r) => {
                const live = allProducts.find((p) => p.sku === r.sku);
                const product = live ?? hybridResultToProduct(r);
                return (
                  <ProductCard
                    key={r.sku}
                    product={product}
                    recommended={recSet.has(r.sku)}
                    dimmed={false}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}






      {showTilesLayout ? (
        <>
          {/* Recommended picks above */}
          {recommendedProducts.length > 0 && (
            <div className="border-t bg-muted/30">
              <div className="mx-auto max-w-5xl px-4 py-6">
                <div className="flex items-end justify-between mb-4 border-b-2 border-brand/70 pb-2">
                  <h2 className="text-xl font-bold text-brand">Recommended for this job</h2>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">{recommendedProducts.length} Products</span>
                    <button
                      onClick={onResetRecommendations}
                      className="text-sm font-medium text-brand hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {recommendedProducts.map((p) => (
                    <ProductCard key={p.sku} product={p} recommended dimmed={false} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Category tiles — identical to landing page */}
          <div className="border-t">
            <div className="mx-auto max-w-2xl px-4 py-8">
              <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase tracking-wide">
                <div className="flex-1 h-px bg-border" />
                or browse by category
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {categoryTiles.map((c) => (
                  <CategoryTile key={c.category} tile={c} onSelect={() => onSelectCategory(c.category)} />
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Full filtered catalog grid — when a category tile was clicked */
        <div className="border-t bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 py-6">
            <div className="flex items-end justify-between mb-4 border-b-2 border-brand/70 pb-2">
              <h2 className="text-xl font-bold text-brand">{selectedCategory}</h2>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">{sortedProducts.length} Products</span>
                <button
                  onClick={onClearCategory}
                  className="text-sm font-medium text-brand hover:underline"
                >
                  Clear filter
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sortedProducts.map((p) => (
                <ProductCard
                  key={p.sku}
                  product={p}
                  recommended={recSet.has(p.sku)}
                  dimmed={false}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function MessageBubble({ msg, products }: { msg: ChatMessage; products: Product[] }) {
  const cart = useCart();
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-brand text-brand-foreground rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%] text-[15px]">
          {msg.content}
        </div>
      </div>
    );
  }

  // Parse product tokens from this specific message so the
  // "Add all to cart" action sits directly under the response that produced it.
  const tokens: { sku: string; qty: number }[] = [];
  const seen = new Set<string>();
  const re = /\[\[product:([A-Za-z0-9_-]+)(?::(\d+))?\]\]/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(msg.content)) !== null) {
    const sku = mm[1];
    if (seen.has(sku)) continue;
    seen.add(sku);
    tokens.push({ sku, qty: mm[2] ? parseInt(mm[2], 10) : 1 });
  }
  const bundle = tokens
    .map((t) => ({ p: products.find((x) => x.sku === t.sku), qty: t.qty }))
    .filter((b): b is { p: Product; qty: number } => !!b.p);

  function addAll() {
    for (const { p, qty } of bundle) {
      cart.add({
        productId: p.sku,
        name: p.name,
        price: p.price,
        qty,
        category: p.category,
        unit: p.unit,
        supplier: p.supplier,
      });
    }
    toast.success(`Added ${bundle.length} item${bundle.length === 1 ? "" : "s"} to cart`);
  }

  return (
    <div className="flex">
      <div className="text-[15px] leading-relaxed max-w-[90%] w-full">
        <AssistantContent content={msg.content} products={products} />
        {msg.content === "" && <span className="inline-block w-1 h-4 bg-foreground/40 animate-pulse" />}
        {bundle.length > 1 && msg.content !== "" && (
          <button
            type="button"
            onClick={addAll}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 text-sm font-semibold transition-colors"
          >
            <Plus className="size-4" /> Add all {bundle.length} to cart
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Assistant content: renders markdown, with [[product:SKU:QTY]] tokens       */
/* replaced by inline product pills.                                          */
/* -------------------------------------------------------------------------- */

const PRODUCT_TOKEN_RE = /\[\[product:([A-Za-z0-9_-]+)(?::(\d+))?\]\]/g;
const FOLLOWUPS_RE = /\[\[followups:([^\]]+)\]\]/;
// Marker we inject as inline `code` so markdown parsing preserves it.
const TOKEN_PREFIX = "§§PROD§§";

function AssistantContent({
  content,
  products,
}: {
  content: string;
  products: Product[];
}) {
  const prepared = useMemo(
    () =>
      content
        .replace(FOLLOWUPS_RE, "")
        // Hide partial trailing marker while streaming.
        .replace(/\[\[followups:[^\]]*$/, "")
        .replace(/\[\[follow?u?p?s?:?$/, "")
        .replace(PRODUCT_TOKEN_RE, (_m, sku, qty) =>
          `\`${TOKEN_PREFIX}${sku}:${qty ?? ""}\``,
        ),
    [content],
  );

  return (
    <div className="text-[15px] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2">{children}</p>,
          h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[15px] font-bold mt-3 mb-1.5">{children}</h3>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="my-2 pl-5 list-disc marker:text-brand space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 pl-5 list-decimal marker:text-brand space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} className="text-brand underline underline-offset-2" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-border" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-brand/40 pl-3 my-2 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children, className, ...rest }: { children?: React.ReactNode; className?: string }) => {
            const raw = String(children ?? "");
            if (raw.startsWith(TOKEN_PREFIX)) {
              const body = raw.slice(TOKEN_PREFIX.length);
              const [sku, qtyStr] = body.split(":");
              const qty = qtyStr ? parseInt(qtyStr, 10) : undefined;
              const p = products.find((x) => x.sku === sku);
              if (p) return <InlineProductBubble product={p} suggestedQty={qty} />;
              return (
                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {sku}
                </span>
              );
            }
            return (
              <code className={`font-mono text-[0.85em] px-1 py-0.5 rounded bg-muted ${className ?? ""}`} {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}

function InlineProductBubble({
  product,
  suggestedQty,
}: {
  product: Product;
  suggestedQty?: number;
}) {
  const cart = useCart();
  const [showDetail, setShowDetail] = useState(false);
  const inCart = cart.items.find((i) => i.productId === product.sku);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const addQty = suggestedQty && suggestedQty > 0 ? suggestedQty : 1;

  function addBatch() {
    cart.add({
      productId: product.sku,
      name: product.name,
      price: product.price,
      qty: addQty,
      category: product.category,
      unit: product.unit,
      supplier: product.supplier,
    });
  }

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setShowDetail(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowDetail(true);
          }
        }}
        className="inline-flex align-middle items-center gap-2 my-0.5 mx-0.5 max-w-full rounded-full border border-brand/40 bg-brand/5 hover:bg-brand/10 hover:border-brand transition-colors cursor-pointer pr-1 pl-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        title={`${product.sku} — ${product.name}`}
      >
        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className="shrink-0 size-7 rounded-full overflow-hidden"
          fallbackClassName="shrink-0 size-7 rounded-full bg-muted text-base"
        />
        <span className="font-semibold text-[13px] leading-tight truncate max-w-[14rem] sm:max-w-[20rem]">
          {product.name}
        </span>
        {inCart ? (
          <span
            onClick={stop}
            className="ml-1 inline-flex items-center rounded-full bg-background border h-7 overflow-hidden shrink-0"
          >
            <HoldButton
              onTick={() => cart.adjust(product.sku, -addQty)}
              stopPropagation
              className="w-7 h-full grid place-items-center hover:bg-accent text-base font-semibold"
              aria-label={addQty > 1 ? `Decrease by ${addQty}` : "Decrease"}
            >
              −
            </HoldButton>
            <QtyInput
              value={inCart.qty}
              onChange={(n) => cart.setQty(product.sku, n)}
              className="w-7 px-1 text-xs"
            />
            <HoldButton
              onTick={() => cart.adjust(product.sku, +addQty)}
              stopPropagation
              className="w-7 h-full grid place-items-center hover:bg-accent text-base font-semibold"
              aria-label={addQty > 1 ? `Increase by ${addQty}` : "Increase"}
            >
              +
            </HoldButton>

          </span>
        ) : (
          <HoldButton
            onTick={addBatch}
            stopPropagation
            className="ml-1 shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 px-2.5 h-7 text-xs font-bold"
            aria-label={`Add ${addQty} ${product.name} to cart`}
          >
            <Plus className="size-3.5" />
            <span className="tabular-nums">
              {addQty > 1 ? `Add ${addQty} · ${formatEUR(product.price)} ea` : `Add · ${formatEUR(product.price)}`}
            </span>
          </HoldButton>
        )}

      </span>
      {showDetail && (
        <ProductDetailModal product={product} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}

function SuggestionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-brand text-brand-foreground hover:opacity-90 px-3 h-9 text-sm font-medium"
    >
      {children}
    </button>
  );
}

function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  inputRef,
  placeholder,
  big,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  big?: boolean;
}) {
  return (
    <div
      className={`relative flex items-end gap-2 rounded-2xl border bg-card shadow-sm focus-within:ring-2 focus-within:ring-brand/40 ${
        big ? "px-4 py-3" : "px-3 py-2"
      }`}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={1}
        placeholder={placeholder}
        className={`flex-1 resize-none bg-transparent outline-none placeholder:text-muted-foreground ${
          big ? "text-lg min-h-[40px]" : "text-base min-h-[28px]"
        }`}
        style={{ maxHeight: 160 }}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="shrink-0 size-11 grid place-items-center rounded-xl bg-brand text-brand-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Send"
      >
        <ArrowUp className="size-5" />
      </button>
    </div>
  );
}

function ProductCard({
  product,
  recommended,
  dimmed,
}: {
  product: Product;
  recommended: boolean;
  dimmed: boolean;
}) {
  const cart = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const inCart = cart.items.find((i) => i.productId === product.sku);

  function add(e?: React.MouseEvent) {
    e?.stopPropagation();
    cart.add({
      productId: product.sku,
      name: product.name,
      price: product.price,
      qty: 1,
      category: product.category,
      unit: product.unit,
      supplier: product.supplier,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setShowDetail(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowDetail(true);
          }
        }}
        className={`group relative rounded-md border bg-card p-4 flex gap-4 transition-all duration-300 cursor-pointer hover:border-foreground/30 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/40 ${
          dimmed ? "opacity-20 pointer-events-none" : "opacity-100"
        } ${recommended ? "border-brand border-2" : ""}`}
      >
        {recommended && (
          <div className="absolute -top-2 left-3 bg-brand text-brand-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
            Pick
          </div>
        )}

        <ProductImage
          src={product.imageUrl}
          alt={product.name}
          className="shrink-0 w-28 h-28 sm:w-32 sm:h-32 rounded overflow-hidden"
          fallbackClassName="shrink-0 w-28 h-28 sm:w-32 sm:h-32 bg-muted/50 rounded text-4xl"
        />



        <div className="flex-1 min-w-0 flex flex-col">
          <h3 className="font-bold text-base leading-tight text-foreground line-clamp-2">
            {product.name}
          </h3>
          {product.description && (
            <p className="text-sm text-muted-foreground leading-snug mt-1 line-clamp-3">
              {product.description}
            </p>
          )}
          <div className="mt-auto pt-2 flex items-end justify-between gap-2">
            <div className="text-xs text-muted-foreground min-w-0">
              <div className="font-mono truncate">{product.sku}</div>
              {product.supplier && <div className="truncate">{product.supplier}</div>}
            </div>
            {inCart ? (
              <div onClick={stop} className="flex items-center rounded-md border h-11 overflow-hidden shrink-0">
                <HoldButton
                  onTick={() => cart.adjust(product.sku, -1)}
                  stopPropagation
                  className="w-11 h-full grid place-items-center hover:bg-accent text-xl font-semibold"
                  aria-label="Decrease"
                >
                  −
                </HoldButton>
                <QtyInput
                  value={inCart.qty}
                  onChange={(n) => cart.setQty(product.sku, n)}
                  className="w-12 px-2 text-base"
                />
                <HoldButton
                  onTick={() => cart.adjust(product.sku, +1)}
                  stopPropagation
                  className="w-11 h-full grid place-items-center hover:bg-accent text-xl font-semibold"
                  aria-label="Increase"
                >
                  +
                </HoldButton>

              </div>
            ) : (
              <button
                onClick={add}
                className="shrink-0 h-11 flex items-stretch rounded-md overflow-hidden bg-foreground text-background font-bold text-sm"
              >
                <span className="px-3 grid place-items-center tabular-nums">{formatEUR(product.price)}</span>
                <span className="w-11 grid place-items-center bg-brand text-brand-foreground">
                  {justAdded ? <Check className="size-5" /> : <Plus className="size-5" />}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
      {showDetail && (
        <ProductDetailModal product={product} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}

function ProductDetailModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const cart = useCart();
  const inCart = cart.items.find((i) => i.productId === product.sku);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  function addOne() {
    cart.add({
      productId: product.sku,
      name: product.name,
      price: product.price,
      qty: 1,
      category: product.category,
      unit: product.unit,
      supplier: product.supplier,
    });
  }

  const attrEntries = Object.entries(product.attributes ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== ""
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl bg-background sm:rounded-xl shadow-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col">
        <div className="sticky top-0 z-10 flex items-start gap-3 px-5 py-4 border-b bg-background">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <span>{product.sku}</span>
              {product.supplier && <><span>·</span><span className="font-sans">{product.supplier}</span></>}
            </div>
            <h2 className="font-bold text-xl leading-tight mt-1">{product.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="size-11 grid place-items-center rounded-md hover:bg-accent shrink-0"
            aria-label="Close"
          >
            <X className="size-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="flex gap-4 items-start">
            <ProductImage
              src={product.imageUrl}
              alt={product.name}
              className="shrink-0 w-32 h-32 rounded overflow-hidden"
              fallbackClassName="shrink-0 w-32 h-32 bg-muted/50 rounded text-5xl"
            />


            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <div className="text-3xl font-bold tabular-nums">{formatEUR(product.price)}</div>
                <div className="text-sm text-muted-foreground">per {product.unit}</div>
              </div>
              {inCart ? (
                <div className="flex items-center rounded-md border h-12 overflow-hidden w-fit">
                  <HoldButton
                    onTick={() => cart.adjust(product.sku, -1)}
                    className="w-12 h-full grid place-items-center hover:bg-accent text-2xl font-semibold"
                    aria-label="Decrease"
                  >−</HoldButton>
                  <QtyInput
                    value={inCart.qty}
                    onChange={(n) => cart.setQty(product.sku, n)}
                    className="w-14 px-3 text-lg"
                  />
                  <HoldButton
                    onTick={() => cart.adjust(product.sku, +1)}
                    className="w-12 h-full grid place-items-center hover:bg-accent text-2xl font-semibold"
                    aria-label="Increase"
                  >+</HoldButton>

                </div>
              ) : (
                <button
                  onClick={addOne}
                  className="h-12 px-5 rounded-md bg-brand text-brand-foreground font-bold flex items-center gap-2"
                >
                  <Plus className="size-5" /> Add to cart
                </button>
              )}
              {product.hazardous && (
                <div className="inline-flex items-center gap-2 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 px-3 py-1.5 text-sm font-semibold">
                  ⚠ Hazardous material
                </div>
              )}
            </div>
          </div>

          {product.description && (
            <Section title="About">
              <p className="text-base leading-relaxed text-foreground/90">{product.description}</p>
            </Section>
          )}

          {product.useCases && product.useCases.length > 0 && (
            <Section title="When to use it">
              <ul className="space-y-3">
                {product.useCases.map((uc, i) => (
                  <li key={i} className="rounded-md border bg-muted/30 p-3">
                    <div className="font-semibold text-base">{uc.scenario}</div>
                    {uc.why && (
                      <div className="text-sm text-muted-foreground mt-1 leading-relaxed">{uc.why}</div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {attrEntries.length > 0 && (
            <Section title="Specifications">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {attrEntries.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-border/50 py-1.5">
                    <dt className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
                    <dd className="font-semibold text-right">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {(product.storageLocation || product.typicalSite || product.consumable || product.sourceCategory) && (
            <Section title="On site">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {product.typicalSite && <DetailRow label="Typical site" value={product.typicalSite} />}
                {product.storageLocation && <DetailRow label="Storage" value={product.storageLocation} />}
                {product.consumable && <DetailRow label="Consumable" value={product.consumable} />}
                {product.sourceCategory && <DetailRow label="Category" value={product.sourceCategory} />}
              </dl>
            </Section>
          )}

          {product.keywords && product.keywords.length > 0 && (
            <Section title="Also known as">
              <div className="flex flex-wrap gap-1.5">
                {product.keywords.map((k) => (
                  <span key={k} className="text-xs bg-muted text-muted-foreground rounded-full px-2.5 py-1">
                    {k}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-wide text-brand mb-2">{title}</h3>
      {children}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/50 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-right">{value}</dd>
    </div>
  );
}

function CartDrawer({ onClose }: { onClose: () => void }) {
  const cart = useCart();
  const orders = useOrders();
  const navigate = useNavigate();
  const tier = tierFor(cart.subtotal);
  const startNegotiation = useServerFn(startNegotiationForOrder);
  const { save: saveTemplate } = useTemplates();

  function handleSaveTemplate() {
    if (cart.items.length === 0) return;
    const name = window.prompt("Name this template (e.g. 'PPE refresh', 'Drywall starter')");
    if (!name) return;
    const tpl = saveTemplate(
      name,
      cart.items.map((i) => ({ sku: i.productId, qty: i.qty })),
    );
    toast.success(`Saved "${tpl.name}" — reuse it from the home screen`);
  }

  async function submit() {
    if (cart.items.length === 0) return;
    // Snapshot the current chat thread so /orders → "Find alternatives"
    // can restore the exact context that produced this order.
    let snapshot: import("@/lib/orders").ChatSnapshot | undefined;
    try {
      const raw = localStorage.getItem("comstruct-chat");
      if (raw) {
        const parsed = JSON.parse(raw);
        const msgs = Array.isArray(parsed?.messages) ? parsed.messages : [];
        const lastUser = [...msgs].reverse().find((m: { role: string }) => m?.role === "user");
        snapshot = {
          messages: msgs,
          recommendedIds: Array.isArray(parsed?.recommendedIds) ? parsed.recommendedIds : [],
          recommendedQty: typeof parsed?.recommendedQty === "object" && parsed.recommendedQty ? parsed.recommendedQty : {},
          lastQuery: typeof lastUser?.content === "string" ? lastUser.content : undefined,
        };
      }
    } catch {}
    const createdOrders = orders.createFromCart(cart.items, snapshot);
    cart.clear();
    onClose();
    if (createdOrders.length === 0) return;

    const [{ generatePurchaseOrdersBySupplier }, { fetchSuppliers, supplierContactMap }] = await Promise.all([
      import("@/lib/po-pdf"),
      import("@/lib/suppliers"),
    ]);
    const contacts = supplierContactMap(await fetchSuppliers().catch(() => []));

    // One Order is already one supplier — so each yields exactly one PO PDF.
    // PDFs are generated in-memory for supplier email attachments; we do NOT
    // auto-download them to the user's browser. They remain accessible from
    // the order detail page if needed.
    const perOrderPOs = createdOrders.map((created) => {
      const pos = generatePurchaseOrdersBySupplier(created, contacts);
      return { created, pos };
    });

    const orderCount = createdOrders.length;
    const orderLabel = orderCount === 1
      ? createdOrders[0].id
      : `${orderCount} orders (${createdOrders.map((o) => o.id).join(", ")})`;

    // Kick off negotiations for every auto-approved order in parallel.
    const autoOrders = perOrderPOs.filter(({ created }) => created.tier === "auto");
    if (autoOrders.length > 0) {
      const sendingToast = toast.loading(
        `${orderLabel}: contacting ${autoOrders.length} supplier${autoOrders.length === 1 ? "" : "s"}…`,
      );
      try {
        const results = await Promise.all(
          autoOrders.map(async ({ created, pos }) => {
            const attachments = await Promise.all(
              pos.map(async (p) => {
                const dataUri = p.doc.output("datauristring");
                const comma = dataUri.indexOf(",");
                const pdfBase64 = comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
                return { supplierName: p.supplierName, filename: p.filename, pdfBase64 };
              }),
            );
            return startNegotiation({
              data: {
                order: {
                  id: created.id,
                  project: created.project,
                  subtotal: created.subtotal,
                  items: created.items.map((i) => ({
                    productId: i.productId,
                    name: i.name,
                    qty: i.qty,
                    price: i.price,
                    unit: i.unit,
                    category: i.category,
                    supplier: i.supplier ?? null,
                  })),
                },
                attachments,
              },
            }) as Promise<
              | { ok: true; results: Array<{ supplier: string; email: string }> }
              | { ok: false; error: string }
            >;
          }),
        );
        const okCount = results.filter((r) => r?.ok).length;
        if (okCount === results.length) {
          toast.success(`${orderLabel} sent · PO PDFs downloaded`, { id: sendingToast });
        } else {
          toast.error(`Email agent failed for ${results.length - okCount}/${results.length} order(s)`, { id: sendingToast });
        }
      } catch (e) {
        console.error("startNegotiationForOrder error:", e);
        toast.error("Email agent failed to start", { id: sendingToast });
      }
    }

    const pmCount = createdOrders.filter((o) => o.tier === "pm").length;
    const centralCount = createdOrders.filter((o) => o.tier === "central").length;
    if (pmCount > 0) {
      toast.success(`${pmCount} order${pmCount === 1 ? "" : "s"} sent to ${PM.name} for approval`);
    }
    if (centralCount > 0) {
      toast.success(`${centralCount} order${centralCount === 1 ? "" : "s"} sent to ${CENTRAL.name} for approval`);
    }

    // Navigate to the first order's tracking page; the orders list shows the rest.
    navigate({ to: "/orders/$orderId/track", params: { orderId: createdOrders[0].id } });
  }


  const ctaLabel =
    tier === "auto"
      ? "Send order to supplier"
      : tier === "pm"
        ? "Send for PM approval"
        : "Send for central approval";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-background h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 h-14 border-b">
          <h2 className="font-semibold">Cart ({cart.count})</h2>
          <button onClick={onClose} className="size-9 grid place-items-center rounded-md hover:bg-accent">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <RedbullIncentive subtotal={cart.subtotal} />
          {cart.items.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-12">Cart is empty</div>
          )}
          {cart.items.map((i) => (
            <div key={i.productId} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm leading-tight">{i.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatEUR(i.price)} / {i.unit}
                  </div>
                </div>
                <button
                  onClick={() => cart.remove(i.productId)}
                  className="size-8 grid place-items-center text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Remove"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center rounded-md border h-10 overflow-hidden">
                  <HoldButton
                    onTick={() => cart.adjust(i.productId, -1)}
                    className="w-10 h-full grid place-items-center hover:bg-accent text-lg font-semibold"
                    aria-label="Decrease"
                  >−</HoldButton>
                  <QtyInput
                    value={i.qty}
                    onChange={(n) => cart.setQty(i.productId, n)}
                    className="w-12 px-2 text-base"
                  />
                  <HoldButton
                    onTick={() => cart.adjust(i.productId, +1)}
                    className="w-10 h-full grid place-items-center hover:bg-accent text-lg font-semibold"
                    aria-label="Increase"
                  >+</HoldButton>

                </div>
                <div className="font-bold text-base tabular-nums">{formatEUR(i.qty * i.price)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t p-4 space-y-3">
          {cart.items.length > 0 && <ApprovalTierPill tier={tier} subtotal={cart.subtotal} />}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold">{formatEUR(cart.subtotal)}</span>
          </div>
          <button
            disabled={cart.items.length === 0}
            onClick={submit}
            className="w-full h-12 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-40"
          >
            {ctaLabel}
          </button>
          <button
            disabled={cart.items.length === 0}
            onClick={handleSaveTemplate}
            className="w-full h-10 rounded-lg border border-input bg-background text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
          >
            <Bookmark className="size-4" />
            Save as quick-buy template
          </button>
        </div>
      </div>
    </div>
  );
}

function RedbullIncentive({ subtotal }: { subtotal: number }) {
  const remaining = Math.max(0, REDBULL_THRESHOLD - subtotal);
  const unlocked = remaining === 0;
  const progress = Math.min(100, (subtotal / REDBULL_THRESHOLD) * 100);
  return (
    <div className="rounded-lg border bg-card p-2 flex items-center gap-3">
      <div className="h-14 w-14 shrink-0 rounded-md bg-muted overflow-hidden">
        <img
          src={redbullImg}
          alt="Complimentary 6-pack of Red Bull"
          width={112}
          height={112}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-xs font-semibold leading-tight truncate">
            Free 6-pack of Red Bull
          </div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">
            Gift
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
          {unlocked
            ? "Unlocked — ships with your delivery."
            : `Spend ${formatEUR(remaining)} more to unlock.`}
        </p>
        <div className="h-1 w-full rounded-sm bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ApprovalTierPill({ tier, subtotal }: { tier: ApprovalTier; subtotal: number }) {
  const styles = {
    auto: {
      box: "border-emerald-500/40 bg-emerald-500/10",
      title: "text-emerald-700 dark:text-emerald-400",
      label: "Auto-approved",
      body: `Subtotal ${formatEUR(subtotal)} is under ${formatEUR(TIER_THRESHOLDS.pm)} — order ships straight to the supplier.`,
    },
    pm: {
      box: "border-amber-500/40 bg-amber-500/10",
      title: "text-amber-700 dark:text-amber-400",
      label: `Needs PM approval — ${PM.name}`,
      body: `Subtotal ${formatEUR(subtotal)} is between ${formatEUR(TIER_THRESHOLDS.pm)} and ${formatEUR(TIER_THRESHOLDS.central)}.`,
    },
    central: {
      box: "border-rose-500/40 bg-rose-500/10",
      title: "text-rose-700 dark:text-rose-400",
      label: `Needs central approval — ${CENTRAL.name}`,
      body: `Subtotal ${formatEUR(subtotal)} is above ${formatEUR(TIER_THRESHOLDS.central)}.`,
    },
  }[tier];
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${styles.box}`}>
      <div className={`font-semibold ${styles.title}`}>{styles.label}</div>
      <div className="text-muted-foreground mt-0.5">{styles.body}</div>
    </div>
  );
}

function ApprovalBanner() {
  const cart = useCart();
  const decision = useCheckoutDecision(cart.items);
  if (cart.items.length === 0 || decision.action !== "requires_approval") return null;
  const headline = decision.hits[0]?.message ?? "Needs PM approval";
  return (
    <div className="fixed bottom-[88px] left-0 right-0 z-40 mx-auto max-w-3xl px-4 pointer-events-none">
      <div className="pointer-events-auto rounded-lg bg-brand text-brand-foreground px-4 py-3 shadow-lg flex items-center justify-between gap-3 text-sm font-medium">
        <span className="line-clamp-2">{headline}</span>
        <button
          className="shrink-0 rounded-md bg-background/20 hover:bg-background/30 px-3 py-1.5 text-xs font-semibold"
          onClick={() => toast.success("Sent for PM approval")}
        >
          Send for approval
        </button>
      </div>
    </div>
  );
}


/**
 * Convert a hybrid-search RPC row into a `Product` so it can be rendered
 * with the same `<ProductCard>` used by category browsing. The RPC returns
 * a subset of columns (no image_url / use_cases / attributes), so we fill
 * in safe defaults — the live catalog usually has the same SKU and that
 * version (with image) is preferred at the call site.
 */
function hybridResultToProduct(r: HybridSearchResult): Product {
  return {
    sku: r.sku,
    name: r.name,
    category: r.category,
    sourceCategory: null,
    unit: r.unit,
    price: Number(r.price_eur),
    supplier: r.supplier,
    consumable: null,
    hazardous: false,
    storageLocation: null,
    typicalSite: null,
    attributes: {},
    keywords: r.keywords ?? [],
    description: r.description,
    useCases: [],
    enrichedAt: null,
    imageUrl: null,
  };
}



