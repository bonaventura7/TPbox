import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'

interface LinkCardProps {
  href: string
  title: string
  description: string
  external?: boolean
  children?: ReactNode
}

export function LinkCard({ href, title, description, external, children }: LinkCardProps) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="group flex h-full flex-col rounded-lg border bg-card p-5 shadow-sm transition-colors hover:border-petrol/50 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="font-serif text-lg font-semibold leading-tight text-foreground group-hover:text-petrol">
          {title}
        </h3>
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          {children}
        </span>
      </div>
      <p className="mt-auto text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {external && (
        <span className="mt-3 inline-flex items-center text-xs text-petrol">
          Apri link esterno
          <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
        </span>
      )}
    </a>
  )
}
