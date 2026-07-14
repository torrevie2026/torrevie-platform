import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type Option = { value: string; label: string };

interface Props {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  className?: string;
}

export const MultiSelectFilter: React.FC<Props> = ({ label, options, selected, onChange, searchable = true, className }) => {
  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-9 justify-between gap-2 font-normal', className)}>
          <span className="text-xs">{label}</span>
          {selected.length > 0 ? (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{selected.length}</Badge>
          ) : null}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0 bg-popover" align="start">
        <Command>
          {searchable && options.length > 6 ? <CommandInput placeholder={`Search ${label.toLowerCase()}…`} className="h-9" /> : null}
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map(opt => {
                const active = selected.includes(opt.value);
                return (
                  <CommandItem key={opt.value} onSelect={() => toggle(opt.value)} className="cursor-pointer">
                    <div className={cn('mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                      active ? 'bg-primary text-primary-foreground' : 'opacity-50')}>
                      {active ? <Check className="h-3 w-3" /> : null}
                    </div>
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.length > 0 ? (
              <div className="border-t p-1">
                <Button variant="ghost" size="sm" className="w-full justify-center text-xs h-7" onClick={() => onChange([])}>
                  Clear
                </Button>
              </div>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
