import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

type LinkCardProps = {
  href: string
  title: string
  description?: string
  external?: boolean
  children?: ReactNode
}

export function LinkCard({ href, title, description, external, children }: LinkCardProps) {
  const inner = (
    <>
      <span className="flex items-center gap-2 text-petrol">
        {children}
        <span className="font-serif text-lg leading-tight font-semibold text-foreground">{title}</span>
      </span>
      {description ? (
        <span className="mt-2 block text-sm text-muted-foreground">{description}</span>
      ) : null}
      <span className="mt-4 flex items-center gap-1 text-sm font-medium text-petrol">
        Apri
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </>
  )

  const className =
    'group block h-full rounded-md border border-border bg-card p-5 transition-colors hover:border-petrol focus-visible:ring-2 focus-visible:ring-petrol focus-visible:outline-none'

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
        {inner}
      </a>
    )
  }

  return (
    <Link to={href} className={className}>
      {inner}
    </Link>
  )
}