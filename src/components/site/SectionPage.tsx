import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs tracking-[0.18em] text-petrol uppercase">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl font-serif text-3xl leading-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {intro}
        </p>
      </div>
    </div>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">{children}</div>
  );
}

export function ReferenceList({
  items,
}: {
  items: { title: string; description: string; meta: string }[];
}) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {items.map((item) => (
        <li key={item.title} className="border border-border bg-card p-5">
          <h3 className="font-serif text-lg leading-snug">{item.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {item.description}
          </p>
          <p className="mt-3 text-xs tracking-wide text-muted-foreground uppercase">
            {item.meta}
          </p>
        </li>
      ))}
    </ul>
  );
}