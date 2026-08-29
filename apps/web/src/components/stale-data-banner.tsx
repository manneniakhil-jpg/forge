import { Badge } from "@/components/ui";
import { formatAgeMinutes } from "@ev/domain";

export function StaleDataBanner({
  message,
  cachedAt,
  variant = "warning",
}: {
  message: string;
  cachedAt?: string | null;
  variant?: "warning" | "info";
}) {
  const age = cachedAt ? formatAgeMinutes(cachedAt) : null;
  const colors =
    variant === "warning"
      ? "border-amber-800/50 bg-amber-950/40 text-amber-100"
      : "border-slate-700 bg-slate-900/80 text-slate-300";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${colors}`} role="status">
      <p>{message}</p>
      {age && age.minutes >= 0 && (
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="warning">{age.display}</Badge>
        </div>
      )}
    </div>
  );
}
