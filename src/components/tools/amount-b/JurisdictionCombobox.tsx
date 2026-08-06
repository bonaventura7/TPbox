/**
 * Amount B – Selettore della giurisdizione.
 *
 * La data table OCSE contiene oltre duecento giurisdizioni: un menu a tendina
 * semplice sarebbe inutilizzabile, quindi la selezione avviene per ricerca
 * testuale con navigazione da tastiera.
 */

import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { cn } from "../../../lib/utils";
import type { JurisdictionRecord } from "../../../lib/amount-b/datasets/types";

interface Props {
  readonly jurisdictions: readonly JurisdictionRecord[];
  readonly value: string;
  readonly onChange: (jurisdiction: string) => void;
}

export function JurisdictionCombobox({ jurisdictions, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => jurisdictions.find((j) => j.jurisdiction === value),
    [jurisdictions, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label="Giurisdizione della tested party"
          className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background"
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected ? selected.jurisdiction : "Seleziona una giurisdizione"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Cerca una giurisdizione…" />
          <CommandList>
            <CommandEmpty>Nessuna giurisdizione corrisponde alla ricerca.</CommandEmpty>
            <CommandGroup>
              {jurisdictions.map((j) => (
                <CommandItem
                  key={j.jurisdiction}
                  value={j.jurisdiction}
                  onSelect={() => {
                    onChange(j.jurisdiction);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      j.jurisdiction === value ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
                  <span className="flex-1">{j.jurisdiction}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    Cat. {j.category}
                    {j.damQualifying ? " · DAM" : ""}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
