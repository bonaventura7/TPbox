import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/attualita", label: "Attualità" },
  { to: "/normativa", label: "Normativa e prassi" },
  { to: "/giurisprudenza", label: "Giurisprudenza" },
  { to: "/tool", label: "Tool" },
] as const;

const NORMATIVA = [
  { to: "/normativa/country-profiles", label: "Country Profiles" },
  { to: "/normativa/portale-interpelli", label: "Portale interpelli" },
] as const;

const TOOLS = [
  { to: "/tool/company-finder", label: "Company Finder" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-[2px]">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Salta al contenuto
      </a>
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center border border-petrol font-serif text-sm font-semibold text-petrol"
          >
            TP
          </span>
          <span className="min-w-0">
            <span className="block truncate font-serif text-lg leading-tight font-semibold">
              Osservatorio Transfer Pricing
            </span>
            <span className="hidden text-xs tracking-wide text-muted-foreground uppercase sm:block">
              Portale indipendente · fonti e strumenti
            </span>
          </span>
        </Link>

        <nav aria-label="Navigazione principale" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className="inline-flex min-h-11 items-center rounded-sm px-3 text-sm text-foreground/80 transition-colors hover:text-petrol data-[status=active]:font-medium data-[status=active]:text-petrol"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Apri il menu di navigazione"
              className="min-h-11 min-w-11 lg:hidden"
            >
              <Menu aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[19rem] overflow-y-auto">
            <SheetTitle className="font-serif">Navigazione</SheetTitle>
            <nav aria-label="Navigazione principale mobile" className="mt-4">
              <ul className="space-y-1">
                {NAV.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="block rounded-sm px-2 py-3 text-base"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-6 px-2 text-xs tracking-wide text-muted-foreground uppercase">
                Normativa e prassi
              </p>
              <ul className="mt-1 space-y-1">
                {NORMATIVA.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="block rounded-sm px-2 py-2.5 text-sm text-muted-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-6 px-2 text-xs tracking-wide text-muted-foreground uppercase">
                Tool
              </p>
              <ul className="mt-1 space-y-1">
                {TOOLS.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="block rounded-sm px-2 py-2.5 text-sm text-muted-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      <div className="hidden border-t border-border bg-secondary/60 lg:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-6 py-2 text-xs">
          <span className="tracking-wide text-muted-foreground uppercase">
            Sezioni
          </span>
          {[...NORMATIVA, ...TOOLS].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-foreground/75 transition-colors hover:text-petrol data-[status=active]:text-petrol"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}