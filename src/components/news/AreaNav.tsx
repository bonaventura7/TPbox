import { Link } from "@tanstack/react-router";

const AREAS = [
  { to: "/attualita", label: "Tutte le aree", exact: true },
  { to: "/attualita/ocse", label: "OCSE", exact: false },
  { to: "/attualita/unione-europea", label: "Unione europea", exact: false },
  { to: "/attualita/italia", label: "Italia", exact: false },
] as const;

/** Navigazione tra i feed per area geografica. */
export function AreaNav() {
  return (
    <nav aria-label="Aree di attualità" className="border-b border-border bg-secondary/50">
      <ul className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-1 px-4 py-2 text-sm sm:px-6">
        {AREAS.map((area) => (
          <li key={area.to}>
            <Link
              to={area.to}
              activeOptions={{ exact: area.exact }}
              className="inline-flex min-h-11 items-center text-foreground/75 transition-colors hover:text-petrol data-[status=active]:font-medium data-[status=active]:text-petrol"
            >
              {area.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
