/** Testo di aiuto breve associato a un campo tramite aria-describedby. */
export function WaccInputHelp({
  id,
  children,
}: {
  readonly id: string;
  readonly children: string;
}) {
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {children}
    </p>
  );
}
