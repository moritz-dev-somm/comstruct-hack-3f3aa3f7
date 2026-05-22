import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UploadCloud, FileText, Trash2, Loader2, CheckCircle2, AlertTriangle, Database } from "lucide-react";
import { toast } from "sonner";
import {
  parseImportFile,
  commitImport,
  listImports,
  deleteImport,
} from "@/lib/product-import.functions";

const ACCEPTED = [".xlsx", ".xls", ".csv", ".pdf"];
const MAX_BYTES = 5 * 1024 * 1024;

type ImportRow = {
  id: string;
  filename: string;
  mime_type: string | null;
  row_count: number;
  status: string;
  error: string | null;
  created_at: string;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return reject(new Error("Read failed"));
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

export function ImportDatabaseTab() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");

  const parseFn = useServerFn(parseImportFile);
  const commitFn = useServerFn(commitImport);
  const listFn = useServerFn(listImports);
  const deleteFn = useServerFn(deleteImport);

  const importsQ = useQuery({
    queryKey: ["product-imports"],
    queryFn: () => listFn(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Removed ${res.deleted} product${res.deleted === 1 ? "" : "s"} from the catalog.`);
        qc.invalidateQueries({ queryKey: ["product-imports"] });
        qc.invalidateQueries({ queryKey: ["products"] });
      } else {
        toast.error(res.error);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  async function processFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(`${file.name} is larger than 5 MB. Please split it first.`);
      return;
    }
    const lower = file.name.toLowerCase();
    if (!ACCEPTED.some((ext) => lower.endsWith(ext))) {
      toast.error(`${file.name}: unsupported file type.`);
      return;
    }
    setBusyFile(file.name);
    setProgress("Reading file…");
    try {
      const base64 = await fileToBase64(file);
      setProgress("Extracting product rows…");
      const parsed = await parseFn({
        data: { filename: file.name, mimeType: file.type || null, base64 },
      });
      if (!parsed.ok) {
        toast.error(`${file.name}: ${parsed.error}`);
        return;
      }
      if (parsed.rows.length === 0) {
        toast.error(`${file.name}: no product rows detected.`);
        return;
      }
      setProgress(`Enriching ${parsed.rows.length} product${parsed.rows.length === 1 ? "" : "s"} with AI…`);
      const committed = await commitFn({
        data: { filename: file.name, mimeType: file.type || null, rows: parsed.rows },
      });
      if (!committed.ok) {
        toast.error(`${file.name}: ${committed.error}`);
        return;
      }
      toast.success(
        `${file.name}: added ${committed.inserted} product${committed.inserted === 1 ? "" : "s"}${committed.failed ? ` (${committed.failed} failed)` : ""}.`,
      );
      qc.invalidateQueries({ queryKey: ["product-imports"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyFile(null);
      setProgress("");
    }
  }

  async function handleFiles(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      await processFile(f);
    }
  }

  const imports = (importsQ.data?.ok ? importsQ.data.imports : []) as ImportRow[];

  return (
    <div className="space-y-6">
      <section>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer?.files?.length) void handleFiles(e.dataTransfer.files);
          }}
          onClick={() => !busyFile && inputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${
            dragOver ? "border-brand bg-brand/5" : "border-border bg-card hover:bg-muted/40"
          } ${busyFile ? "pointer-events-none opacity-80" : ""}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {busyFile ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="size-8 text-brand animate-spin" />
              <div className="text-sm font-semibold">{busyFile}</div>
              <div className="text-xs text-muted-foreground">{progress}</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="size-12 rounded-lg bg-brand/10 text-brand grid place-items-center">
                <UploadCloud className="size-6" />
              </div>
              <div className="text-sm font-semibold">Drop supplier database files here</div>
              <div className="text-xs text-muted-foreground">
                Excel (.xlsx, .xls), CSV, or PDF · up to 5 MB · imported as new C-materials
              </div>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1.5 px-3 h-9 rounded-md bg-brand text-brand-foreground text-sm font-semibold hover:bg-brand/90"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                <UploadCloud className="size-4" /> Choose files
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center gap-2">
          <Database className="size-4" />
          <h2 className="font-semibold text-sm">Imported files</h2>
          <span className="text-xs text-muted-foreground ml-auto">
            {importsQ.isLoading ? "Loading…" : `${imports.length} file${imports.length === 1 ? "" : "s"}`}
          </span>
        </div>
        {imports.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No files imported yet. Drag and drop a supplier catalog above to get started.
          </div>
        ) : (
          <ul className="divide-y">
            {imports.map((imp) => (
              <li key={imp.id} className="px-5 py-3 flex items-center gap-3">
                <div className="size-9 rounded-md bg-muted text-muted-foreground grid place-items-center shrink-0">
                  <FileText className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{imp.filename}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                    <span className="tabular-nums">{imp.row_count} product{imp.row_count === 1 ? "" : "s"}</span>
                    <span>·</span>
                    <span>{new Date(imp.created_at).toLocaleString()}</span>
                    {imp.status === "completed" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 className="size-3" /> Completed
                      </span>
                    ) : imp.status === "failed" ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <AlertTriangle className="size-3" /> Failed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="size-3 animate-spin" /> {imp.status}
                      </span>
                    )}
                  </div>
                  {imp.error && <div className="text-xs text-destructive mt-0.5 truncate">{imp.error}</div>}
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Remove "${imp.filename}" and its ${imp.row_count} product${imp.row_count === 1 ? "" : "s"} from the catalog?`)) {
                      deleteMut.mutate(imp.id);
                    }
                  }}
                  disabled={deleteMut.isPending}
                  className="h-9 w-9 rounded-md border hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive grid place-items-center disabled:opacity-50"
                  aria-label="Delete import"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
