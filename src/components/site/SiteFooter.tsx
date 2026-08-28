import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-secondary/50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <p className="font-serif text-lg font-semibold">Osservatorio Transfer Pricing</p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Progetto editoriale indipendente dedicato alla documentazione, alla prassi e agli
            strumenti di analisi in materia di prezzi di trasferimento.
          </p>
        </div>
        <nav aria-label="Sezioni del portale">
          <h2 className="text-xs tracking-wide text-muted-foreground uppercase">Sezioni</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link to="/attualita" className="hover:text-petrol">
                Attualità
              </Link>
            </li>
            <li>
              <Link to="/normativa" className="hover:text-petrol">
                Normativa e prassi
              </Link>
            </li>
            <li>
              <Link to="/giurisprudenza" className="hover:text-petrol">
                Giurisprudenza
              </Link>
            </li>
            <li>
              <Link to="/tool" className="hover:text-petrol">
                Tool
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="text-xs tracking-wide text-muted-foreground uppercase">Trasparenza</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Le sezioni editoriali di questo prototipo usano dati dimostrativi sintetici. Fa
            eccezione Company Finder, che consulta i registri ufficiali europei in tempo reale. In
            entrambi i casi l'acquisizione avviene solo lato server: il browser non chiama siti
            esterni e nessun elemento acquisito viene pubblicato automaticamente.
          </p>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          Prototipo editoriale · dati demo nelle sezioni editoriali, registri ufficiali in Company
          Finder · nessuna affiliazione con enti, editori o testate terze.
        </p>
      </div>
    </footer>
  );
}
