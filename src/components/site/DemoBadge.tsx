import { cn } from "@/lib/utils";

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border border-gold bg-gold/15 px-2 py-0.5 text-[0.7rem] font-medium tracking-wide text-gold-foreground uppercase",
        className,
      )}
    >
      Dato demo
    </span>
  );
}