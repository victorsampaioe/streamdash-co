import { cn } from "@/lib/utils";

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const map: Record<string, string> = {
    up: "bg-success",
    down: "bg-destructive",
    degraded: "bg-warning",
    unknown: "bg-muted-foreground",
  };
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5", className)}>
      {status === "up" && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping" />
      )}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", map[status] ?? map.unknown)} />
    </span>
  );
}

export function StatusLabel({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    up: { label: "Online", cls: "text-success" },
    down: { label: "Offline", cls: "text-destructive" },
    degraded: { label: "Degradado", cls: "text-warning" },
    unknown: { label: "Aguardando", cls: "text-muted-foreground" },
  };
  const it = map[status] ?? map.unknown;
  return <span className={cn("text-xs font-medium", it.cls)}>{it.label}</span>;
}
