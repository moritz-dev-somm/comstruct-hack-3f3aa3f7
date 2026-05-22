import { createFileRoute } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { ImportDatabaseTab } from "@/components/ImportDatabaseTab";

export const Route = createFileRoute("/procurement/catalog/manage")({
  component: ManageDatabasePage,
  head: () => ({
    meta: [{ title: "Manage Database — comstruct" }],
  }),
});

function ManageDatabasePage() {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Database className="size-6" /> Manage Database
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Import supplier catalogs and manage previously uploaded files.
        </p>
      </header>
      <ImportDatabaseTab />
    </div>
  );
}
