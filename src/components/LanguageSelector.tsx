import { useState } from "react";
import { Globe, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type Language = {
  code: string;
  name: string;
  flag: string;
};

const LANGUAGES: Language[] = [
  { code: "EN", name: "English", flag: "🇬🇧" },
  { code: "DE", name: "Deutsch", flag: "🇩🇪" },
  { code: "FR", name: "Français", flag: "🇫🇷" },
  { code: "IT", name: "Italiano", flag: "🇮🇹" },
  { code: "ES", name: "Español", flag: "🇪🇸" },
  { code: "PT", name: "Português", flag: "🇵🇹" },
  { code: "NL", name: "Nederlands", flag: "🇳🇱" },
  { code: "PL", name: "Polski", flag: "🇵🇱" },
  { code: "SV", name: "Svenska", flag: "🇸🇪" },
  { code: "NO", name: "Norsk", flag: "🇳🇴" },
  { code: "DA", name: "Dansk", flag: "🇩🇰" },
  { code: "FI", name: "Suomi", flag: "🇫🇮" },
  { code: "CS", name: "Čeština", flag: "🇨🇿" },
  { code: "HU", name: "Magyar", flag: "🇭🇺" },
  { code: "RO", name: "Română", flag: "🇷🇴" },
  { code: "EL", name: "Ελληνικά", flag: "🇬🇷" },
  { code: "BG", name: "Български", flag: "🇧🇬" },
  { code: "HR", name: "Hrvatski", flag: "🇭🇷" },
  { code: "SL", name: "Slovenščina", flag: "🇸🇮" },
  { code: "SK", name: "Slovenčina", flag: "🇸🇰" },
  { code: "LT", name: "Lietuvių", flag: "🇱🇹" },
  { code: "LV", name: "Latviešu", flag: "🇱🇻" },
  { code: "ET", name: "Eesti", flag: "🇪🇪" },
  { code: "UK", name: "Українська", flag: "🇺🇦" },
  { code: "RU", name: "Русский", flag: "🇷🇺" },
  { code: "SR", name: "Српски", flag: "🇷🇸" },
  { code: "BS", name: "Bosanski", flag: "🇧🇦" },
  { code: "SQ", name: "Shqip", flag: "🇦🇱" },
  { code: "MK", name: "Македонски", flag: "🇲🇰" },
  { code: "MT", name: "Malti", flag: "🇲🇹" },
  { code: "GA", name: "Gaeilge", flag: "🇮🇪" },
  { code: "CY", name: "Cymraeg", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿" },
  { code: "IS", name: "Íslenska", flag: "🇮🇸" },
  { code: "LB", name: "Lëtzebuergesch", flag: "🇱🇺" },
  { code: "TR", name: "Türkçe", flag: "🇹🇷" },
  { code: "BE", name: "Беларуская", flag: "🇧🇾" },
];

export function LanguageSelector() {
  const [selected, setSelected] = useState<Language>(LANGUAGES[0]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Select language"
        className="inline-flex items-center gap-1.5 rounded-full border px-3 h-10 text-xs font-medium hover:bg-accent focus:outline-none"
      >
        <Globe className="size-4" />
        <span className="text-base leading-none">{selected.flag}</span>
        <span className="hidden sm:inline">{selected.code}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-80 w-56 overflow-y-auto"
      >
        {LANGUAGES.map((lang) => {
          const active = lang.code === selected.code;
          return (
            <DropdownMenuItem
              key={lang.code}
              onSelect={() => setSelected(lang)}
              className="flex items-center gap-2 text-sm"
            >
              <span className="text-base leading-none">{lang.flag}</span>
              <span className="flex-1">{lang.name}</span>
              <span className="text-xs text-muted-foreground">{lang.code}</span>
              {active ? <Check className="size-3.5 text-brand" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
