import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ScanLine, X, ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

/** Portal to document.body so the full-screen scan flow escapes any
 * ancestor with `transform`/`backdrop-filter` (e.g. the chat's blurred
 * bottom action bar), which would otherwise clip a `position: fixed`
 * child to a small box. SSR-safe. */
function PortalToBody({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

type ScanResult = {
  kind: "barcode" | "product" | "category" | "unknown";
  code?: string;
  product?: string;
  category?: string;
  description?: string;
  confidence?: number;
};

type Step = "instructions" | "camera" | "analyzing";

/**
 * Grey, hero-sized "Scan" button. On click opens a 3-step flow:
 *   1. instructions — what the scan does
 *   2. camera — live preview + capture button
 *   3. analyzing — uploading photo to /api/scan, then `onResult` is called.
 *
 * The parent decides what to do with the result (typically: compose a prompt
 * and feed it into the existing chat as if the user had typed it).
 */
export function ScanButton({
  size = "hero",
  onResult,
}: {
  size?: "hero" | "compact";
  onResult: (prompt: string, raw: ScanResult) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {size === "hero" ? (
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Scan a product or barcode"
            className="group relative grid h-24 w-24 place-items-center rounded-full bg-secondary text-secondary-foreground border border-border shadow-lg transition-transform active:scale-95 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-foreground/10 select-none touch-none"
          >
            <ScanLine className="relative size-10" strokeWidth={2.5} />
          </button>
          <span className="mt-3 text-sm font-semibold text-foreground">Scan or photo</span>
          <span className="text-xs text-muted-foreground">Identify a product</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Scan a product or barcode"
          className="relative grid size-14 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground border border-border active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-foreground/10"
        >
          <ScanLine className="size-6" strokeWidth={2.5} />
        </button>
      )}

      {open && (
        <ScanFlow
          onClose={() => setOpen(false)}
          onResult={(prompt, raw) => {
            setOpen(false);
            onResult(prompt, raw);
          }}
        />
      )}
    </>
  );
}

function ScanFlow({
  onClose,
  onResult,
}: {
  onClose: () => void;
  onResult: (prompt: string, raw: ScanResult) => void;
}) {
  const [step, setStep] = useState<Step>("instructions");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Start camera when entering the camera step
  useEffect(() => {
    if (step !== "camera") return;
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        console.error("camera error", e);
        setError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Camera permission denied. Allow camera access and try again."
            : "Couldn't open the camera on this device.",
        );
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [step, stopStream]);

  useEffect(() => () => stopStream(), [stopStream]);

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      toast.error("Camera not ready yet.");
      return;
    }
    const canvas = document.createElement("canvas");
    // Cap longest edge at ~1280 to keep upload small.
    const maxEdge = 1280;
    const ratio = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * ratio);
    canvas.height = Math.round(video.videoHeight * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Couldn't capture image.");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    stopStream();
    setStep("analyzing");

    try {
      const resp = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = (await resp.json().catch(() => ({}))) as ScanResult & { error?: string };
      if (!resp.ok) {
        toast.error(data.error || "Couldn't analyse the photo.");
        setStep("camera");
        return;
      }
      const prompt = buildPrompt(data);
      onResult(prompt, data);
    } catch (e) {
      console.error(e);
      toast.error("Network error during scan.");
      setStep("camera");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ScanLine className="size-4" />
          {step === "instructions" && "Scan or photo"}
          {step === "camera" && "Point the camera at the item"}
          {step === "analyzing" && "Identifying…"}
        </span>
        <button
          onClick={() => {
            stopStream();
            onClose();
          }}
          aria-label="Close"
          className="grid size-10 place-items-center rounded-full hover:bg-accent"
        >
          <X className="size-5" />
        </button>
      </div>

      {step === "instructions" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
          <div className="grid size-20 place-items-center rounded-full bg-secondary text-secondary-foreground mb-6">
            <ScanLine className="size-10" strokeWidth={2.2} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Use the camera to identify a product</h2>
          <p className="mt-3 max-w-md text-muted-foreground">
            Two ways to use this:
          </p>
          <ul className="mt-6 max-w-md text-left space-y-4">
            <li className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground font-bold">A</span>
              <div>
                <div className="font-semibold">Scan a barcode or QR code</div>
                <div className="text-sm text-muted-foreground">
                  Hold the code steady in the frame. We'll look it up in your catalog.
                </div>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground font-bold">B</span>
              <div>
                <div className="font-semibold">Take a photo of the product</div>
                <div className="text-sm text-muted-foreground">
                  We'll recognise the item (e.g. "claw hammer") and recommend matching products.
                </div>
              </div>
            </li>
          </ul>
          <button
            onClick={() => setStep("camera")}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand text-brand-foreground px-6 h-12 text-base font-semibold active:scale-[0.98]"
          >
            Continue
            <ArrowRight className="size-5" />
          </button>
        </div>
      )}

      {step === "camera" && (
        <div className="flex-1 flex flex-col">
          <div className="relative flex-1 bg-black overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* Framing guide */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="size-64 max-w-[80vw] max-h-[60vh] rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            {error && (
              <div className="absolute inset-x-4 bottom-4 rounded-lg bg-background/95 border p-3 text-sm">
                {error}
              </div>
            )}
          </div>
          <div className="border-t bg-background px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-md items-center justify-center gap-6">
              <button
                onClick={() => setStep("instructions")}
                aria-label="Back to instructions"
                className="grid size-12 place-items-center rounded-full border hover:bg-accent"
              >
                <RotateCcw className="size-5" />
              </button>
              <button
                onClick={capture}
                disabled={!!error}
                aria-label="Capture photo"
                className="grid size-20 place-items-center rounded-full bg-brand text-brand-foreground shadow-lg active:scale-95 disabled:opacity-40"
              >
                <Camera className="size-9" strokeWidth={2.2} />
              </button>
              <div className="size-12" />
            </div>
          </div>
        </div>
      )}

      {step === "analyzing" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <Loader2 className="size-10 animate-spin text-muted-foreground" />
          <p className="text-base font-medium">Identifying what you scanned…</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Reading any barcode and classifying the product.
          </p>
        </div>
      )}
    </div>
  );
}

/** Turn the structured scan result into a natural-language prompt for the chat. */
function buildPrompt(r: ScanResult): string {
  switch (r.kind) {
    case "barcode":
      return `I just scanned a product barcode/QR code: ${r.code || "(unreadable)"}${
        r.description ? `. The packaging looks like: ${r.description}.` : ""
      } Please check if we stock this exact product. If yes, show it and offer to add it to the cart. If not, recommend the closest equivalent from our catalog and explain the difference.`;
    case "product":
      return `I just took a photo of a product I'd describe as: ${r.product}${
        r.description ? ` (${r.description})` : ""
      }. Please check if we have this exact product or the closest match from our catalog, and offer to add it to my cart.`;
    case "category":
      return `I just took a photo of a ${r.category}${
        r.description ? ` (${r.description})` : ""
      }. Please recommend a few good options from our catalog of ${r.category}s and ask me about quantity / specifics so we can pick the right one.`;
    case "unknown":
    default:
      return `I just took a photo but the system couldn't clearly identify what was in it${
        r.description ? ` (it saw: ${r.description})` : ""
      }. Could you ask me what I'm looking for so we can find it in the catalog?`;
  }
}
