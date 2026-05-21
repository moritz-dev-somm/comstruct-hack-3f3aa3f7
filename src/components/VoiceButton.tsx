import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square, X, ArrowUp } from "lucide-react";
import { toast } from "sonner";

/* -------------------------------------------------------------------------- */
/* Minimal types for Web Speech API (not in lib.dom by default for Safari)    */
/* -------------------------------------------------------------------------- */
interface SRResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SREvent {
  resultIndex: number;
  results: ArrayLike<SRResult>;
}
interface SRErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
}
type SRCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRCtor;
    webkitSpeechRecognition?: SRCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceSupported(): boolean {
  return !!getSpeechRecognition();
}

/* -------------------------------------------------------------------------- */
/* VoiceButton                                                                */
/* -------------------------------------------------------------------------- */
export function VoiceButton({
  onTranscript,
  size = "hero",
  lang,
}: {
  /** Called with the final transcript when the user accepts it. */
  onTranscript: (text: string) => void;
  size?: "hero" | "compact";
  lang?: string;
}) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [level, setLevel] = useState(0); // 0..1 audio amplitude for animation
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  // Guard against the result event firing after the user pressed Send/Cancel
  const cancelledRef = useRef(false);
  // Mobile Safari sometimes fires `end` after a few seconds of silence — track
  // whether we've already delivered a transcript so we don't double-send.
  const deliveredRef = useRef(false);
  // True while the user wants the mic open (used to auto-restart if the
  // browser drops continuous recognition mid-session).
  const intentRef = useRef(false);
  // Timestamp of pointerdown for press-vs-hold detection.
  const pressStartRef = useRef<number>(0);

  useEffect(() => {
    setSupported(isVoiceSupported());
  }, []);

  /* ----- cleanup ----- */
  const teardownAudio = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  const stopRecognition = useCallback((abort = false) => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      if (abort) rec.abort();
      else rec.stop();
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      stopRecognition(true);
      teardownAudio();
    };
  }, [stopRecognition, teardownAudio]);

  /* ----- audio level meter (visual feedback for mobile) ----- */
  async function setupMeter() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Mic permission denied or unsupported — recognition will surface error
    }
  }

  /* ----- start ----- */
  async function start() {
    const SR = getSpeechRecognition();
    if (!SR) {
      toast.error("Voice input isn't supported in this browser. Try Chrome or Safari.");
      return;
    }
    cancelledRef.current = false;
    deliveredRef.current = false;
    setInterim("");
    setFinalText("");

    const rec = new SR();
    rec.lang =
      lang ||
      (typeof navigator !== "undefined" && navigator.language) ||
      "en-US";
    rec.interimResults = true;
    rec.continuous = true; // keep recording until user sends/cancels
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let inter = "";
      let fin = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const txt = r[0]?.transcript ?? "";
        if (r.isFinal) fin += txt;
        else inter += txt;
      }
      if (fin) setFinalText((prev) => (prev + " " + fin).trim());
      setInterim(inter);
    };

    rec.onerror = (e) => {
      const err = e.error;
      if (err === "no-speech") {
        toast("I didn't hear anything — try again.");
      } else if (err === "not-allowed" || err === "service-not-allowed") {
        toast.error("Microphone blocked. Enable mic access in your browser settings.");
      } else if (err === "audio-capture") {
        toast.error("No microphone found.");
      } else if (err === "network") {
        toast.error("Voice recognition needs an internet connection.");
      } else if (err !== "aborted") {
        toast.error(`Voice error: ${err}`);
      }
      cancelledRef.current = true;
    };

    rec.onend = () => {
      // If user still intends to record (continuous mode dropped by browser),
      // restart the recognizer transparently. Otherwise tear down.
      if (intentRef.current && !cancelledRef.current && !deliveredRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* fallthrough — treat as ended */
        }
      }
      setListening(false);
      teardownAudio();
    };

    recRef.current = rec;
    try {
      await setupMeter();
      rec.start();
      setListening(true);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't start the microphone.");
      teardownAudio();
    }
  }

  // Refs that mirror latest state for use inside `onend` (avoids stale closure)
  const finalTextLatestRef = useRef("");
  const interimLatestRef = useRef("");
  useEffect(() => {
    finalTextLatestRef.current = finalText;
  }, [finalText]);
  useEffect(() => {
    interimLatestRef.current = interim;
  }, [interim]);

  function cancel() {
    cancelledRef.current = true;
    deliveredRef.current = true;
    stopRecognition(true);
    teardownAudio();
    setListening(false);
    setInterim("");
    setFinalText("");
  }

  function sendNow() {
    const text = (finalText + " " + interim).trim();
    if (!text) {
      cancel();
      return;
    }
    deliveredRef.current = true;
    stopRecognition();
    teardownAudio();
    setListening(false);
    onTranscript(text);
    setInterim("");
    setFinalText("");
  }

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        className={
          size === "hero"
            ? "mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground"
            : "flex h-14 w-14 items-center justify-center rounded-full border border-border text-muted-foreground"
        }
        aria-label="Voice input unavailable"
        title="Voice not supported on this browser"
      >
        <MicOff className={size === "hero" ? "size-8" : "size-6"} />
      </button>
    );
  }

  /* ----- Hero button (large, visually distinct) ----- */
  if (size === "hero") {
    return (
      <>
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={start}
            aria-label="Hold to talk"
            className="group relative grid h-24 w-24 place-items-center rounded-full bg-brand text-brand-foreground shadow-lg shadow-brand/30 transition-transform active:scale-95 hover:shadow-xl hover:shadow-brand/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
          >
            <span className="absolute inset-0 rounded-full bg-brand/30 opacity-0 group-hover:opacity-100 animate-ping" />
            <Mic className="relative size-10" strokeWidth={2.5} />
          </button>
          <span className="mt-3 text-sm font-semibold text-foreground">Tap to speak</span>
          <span className="text-xs text-muted-foreground">Hands-free on site</span>
        </div>
        {listening && (
          <ListeningOverlay
            interim={interim}
            finalText={finalText}
            level={level}
            onCancel={cancel}
            onSend={sendNow}
          />
        )}
      </>
    );
  }

  /* ----- Compact button (sticky bar) ----- */
  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label="Voice input"
        className="relative grid size-14 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground shadow-md shadow-brand/20 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
      >
        <Mic className="size-6" strokeWidth={2.5} />
      </button>
      {listening && (
        <ListeningOverlay
          interim={interim}
          finalText={finalText}
          level={level}
          onCancel={cancel}
          onSend={sendNow}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Full-screen listening overlay (mobile-friendly)                            */
/* -------------------------------------------------------------------------- */
function ListeningOverlay({
  interim,
  finalText,
  level,
  onCancel,
  onSend,
}: {
  interim: string;
  finalText: string;
  level: number;
  onCancel: () => void;
  onSend: () => void;
}) {
  const transcript = (finalText + " " + interim).trim();
  const scale = 1 + level * 0.6;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background/95 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="size-2 animate-pulse rounded-full bg-red-500" />
          Listening
        </span>
        <button
          onClick={onCancel}
          aria-label="Cancel"
          className="grid size-10 place-items-center rounded-full hover:bg-accent"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {/* Pulsing mic with live audio level */}
        <div className="relative grid h-40 w-40 place-items-center">
          <div
            className="absolute inset-0 rounded-full bg-brand/15 transition-transform duration-75"
            style={{ transform: `scale(${scale})` }}
          />
          <div
            className="absolute inset-4 rounded-full bg-brand/25 transition-transform duration-75"
            style={{ transform: `scale(${1 + level * 0.3})` }}
          />
          <div className="relative grid size-24 place-items-center rounded-full bg-brand text-brand-foreground shadow-lg">
            <Mic className="size-10" strokeWidth={2.5} />
          </div>
        </div>

        <div className="mt-8 min-h-[3em] max-w-md text-xl font-medium leading-snug">
          {transcript ? (
            <>
              {finalText}
              {interim && <span className="text-muted-foreground"> {interim}</span>}
            </>
          ) : (
            <span className="text-muted-foreground">Speak now…</span>
          )}
        </div>
      </div>

      <div
        className="border-t bg-background px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button
            onClick={onCancel}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full border bg-card text-base font-semibold hover:bg-accent"
          >
            <Square className="size-4" fill="currentColor" />
            Cancel
          </button>
          <button
            onClick={onSend}
            disabled={!transcript}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-brand text-brand-foreground text-base font-semibold disabled:opacity-40"
          >
            <ArrowUp className="size-5" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
