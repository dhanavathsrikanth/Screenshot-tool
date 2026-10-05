import { Card } from "@/components/ui";

export default function WorkspaceLoading() {
  return (
    <div role="status" aria-label="Loading workspace page" className="space-y-7">
      <span className="sr-only">Loading your workspace…</span>
      <div aria-hidden="true" className="space-y-3">
        <div className="h-7 w-40 rounded-md bg-raised" />
        <div className="h-3 w-2/3 max-w-md rounded bg-surface" />
      </div>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((item) => <Card key={item} className="space-y-4 p-5"><div className="h-3 w-24 rounded bg-raised" /><div className="h-7 w-16 rounded bg-raised" /><div className="h-2 w-32 rounded bg-surface" /></Card>)}
      </div>
      <Card className="min-h-64 p-5"><div aria-hidden="true" className="h-3 w-32 rounded bg-raised" /></Card>
    </div>
  );
}
