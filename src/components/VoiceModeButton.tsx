import { useCallback } from "react";
import { createPortal } from "react-dom";
import { Phone, PhoneOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useVapiVoice, type VapiTranscriptEvent } from "@/hooks/useVapiVoice";

function PortalToBody({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/**
 * Live voice-mode button (Vapi). Distinct from the existing dictate-only
 * VoiceButton: this one starts a hands-free, voice-in / voice-out
 * conversation. The assistant speaks its reply out loud.
 */
export function VoiceModeButton({
  size = "hero",
  onUserTranscript,
  onAssistantTranscript,
}: {
  size?: "hero" | "compact";
  onUserTranscript: (text: string) => void;
  onAssistantTranscript: (text: string) => void;
}) {
  const handle = useCallback(
    (e: VapiTranscriptEvent) => {
      if (e.role === "user") onUserTranscript(e.text);
      else onAssistantTranscript(e.text);
    },
    [onUserTranscript, onAssistantTranscript],
  );

  const { state, volume, start, stop } = useVapiVoice({
    onTranscript: handle,
    onError: (msg) => toast.error(msg),
  });

  const active = state !== "idle";
  const label =
    state === "connecting"
      ? "Connecting…"
      : state === "speaking"
        ? "Speaking…"
        : state === "listening"
          ? "Listening…"
          : "Voice call";

  const onClick = () => {
    if (active) void stop();
    else void start();
  };

  if (size === "hero") {
    return (
      <>
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={onClick}
            aria-label={active ? "End voice call" : "Start voice call"}
            className={`group relative grid h-24 w-24 place-items-center rounded-full border-2 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 select-none touch-none ${
              active
                ? "bg-brand text-brand-foreground border-brand"
                : "bg-card text-foreground border-border hover:bg-accent"
            }`}
          >
            {state === "connecting" ? (
              <Loader2 className="size-10 animate-spin" strokeWidth={2.5} />
            ) : active ? (
              <PhoneOff className="size-10" strokeWidth={2.5} />
            ) : (
              <Phone className="size-10" strokeWidth={2.5} />
            )}
          </button>
          <span className="mt-3 text-sm font-semibold text-foreground">
            {active ? "End call" : "Voice call"}
          </span>
          <span className="text-xs text-muted-foreground">
            Hands-free, talks back
          </span>
        </div>
        {active && (
          <PortalToBody>
            <VoiceCallOverlay
              label={label}
              state={state}
              volume={volume}
              onEnd={() => void stop()}
            />
          </PortalToBody>
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={active ? "End voice call" : "Start voice call"}
        className={`relative grid size-14 shrink-0 place-items-center rounded-full border active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 select-none touch-none ${
          active
            ? "bg-brand text-brand-foreground border-brand"
            : "bg-card text-foreground border-border hover:bg-accent"
        }`}
      >
        {state === "connecting" ? (
          <Loader2 className="size-6 animate-spin" strokeWidth={2.5} />
        ) : active ? (
          <PhoneOff className="size-6" strokeWidth={2.5} />
        ) : (
          <Phone className="size-6" strokeWidth={2.5} />
        )}
      </button>
      {active && (
        <PortalToBody>
          <VoiceCallOverlay
            label={label}
            state={state}
            volume={volume}
            onEnd={() => void stop()}
          />
        </PortalToBody>
      )}
    </>
  );
}

function VoiceCallOverlay({
  label,
  state,
  volume,
  onEnd,
}: {
  label: string;
  state: string;
  volume: number;
  onEnd: () => void;
}) {
  const scale = 1 + Math.min(1, volume) * 0.5;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[55] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-3xl px-4 pb-4">
        <div className="flex items-center gap-3 rounded-full border bg-background/95 backdrop-blur px-4 py-3 shadow-sm">
          <div className="relative grid size-10 place-items-center">
            <span
              className={`absolute inset-0 rounded-full transition-transform duration-75 ${
                state === "speaking" ? "bg-brand/30" : "bg-brand/15"
              }`}
              style={{ transform: `scale(${scale})` }}
            />
            <span className="relative grid size-7 place-items-center rounded-full bg-brand text-brand-foreground">
              <Phone className="size-3.5" strokeWidth={2.5} />
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold leading-tight">{label}</div>
            <div className="text-xs text-muted-foreground leading-tight">
              Tap end to hang up
            </div>
          </div>
          <button
            type="button"
            onClick={onEnd}
            className="grid size-10 place-items-center rounded-full bg-destructive text-destructive-foreground active:scale-95"
            aria-label="End call"
          >
            <PhoneOff className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
