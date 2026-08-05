import { Link } from "@tanstack/react-router";

const AREAS = [
  { area: "ocse", label: "OCSE" },
  { area: "unione-europea", label: "Unione europea" },
  { area: "italia", label: "Italia" },
] as const;

const LINK_CLASS =
  "inline-flex min-h-11 items-center text-foreground/75 transition-colors hover:text-petrol data-[status=active]:font-medium data-[status=active]:text-petrol";

/** Navigazione tra i feed per area geografica. */
export function AreaNav() {
  return (
    <nav aria-label="Aree di attualità" className="border-b border-border bg-secondary/50">
      <ul className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-1 px-4 py-2 text-sm sm:px-6">
        <li>
          <Link
            to="/attualita"
            activeOptions={{ exact: true }}
            className={LINK_CLASS}
          >
            Tutte le aree
          </Link>
        </li>
        {AREAS.map((item) => (
          <li key={item.area}>
            <Link
              to="/attualita/$area"
              params={{ area: item.area }}
              className={LINK_CLASS}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
