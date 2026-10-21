// src/lib/profileTabIcons.ts
//
// Profile tabs are icon-only (no text labels). Every tab id the profile can
// produce — the fixed ones (posts / media / projects), the type-based ones
// (book / course / event / room / file) and the dynamic Gig categories a
// creator defines themselves ("Artist", "Photography", ...) — resolves to
// one icon here, so ProfilePage never decides icons inline.
//
// Gig categories are free text, so they're matched by keyword; anything
// unrecognised falls back to a briefcase (it's work a person offers).
// When the custom Akọ icon set lands (see 08.8_AKO_ICONS_CREATION.md),
// swapping icons means editing this one file.
import {
  BookOpen,
  Briefcase,
  Camera,
  CalendarDays,
  ChefHat,
  CirclePlay,
  Clapperboard,
  Code,
  DoorOpen,
  Drama,
  Folder,
  GraduationCap,
  LayoutGrid,
  Layers,
  Mic,
  Music,
  Palette,
  PenLine,
  Shirt,
  type LucideIcon,
} from "lucide-react-native";

const FIXED_TAB_ICONS: Record<string, LucideIcon> = {
  posts: LayoutGrid,
  media: CirclePlay,
  projects: Layers,
  "type-book": BookOpen,
  "type-course": GraduationCap,
  "type-event": CalendarDays,
  "type-room": DoorOpen,
  "type-file": Folder,
};

// First match wins, so put the more specific words first.
const CATEGORY_KEYWORDS: [RegExp, LucideIcon][] = [
  [/podcast|voice|radio|host/i, Mic],
  [/music|artist|singer|song|producer|dj|beat|band|gospel|rapper|musician/i, Music],
  [/film|movie|cinema|director|video|animation|editor/i, Clapperboard],
  [/photo|camera/i, Camera],
  [/design|graphic|illustrat|art\b|brand|creative/i, Palette],
  [/writ|author|copy|journal|blog|poet|script/i, PenLine],
  [/teach|tutor|coach|mentor|trainer|lecturer|educat/i, GraduationCap],
  [/develop|engineer|software|web|code|program|app\b/i, Code],
  [/chef|cook|food|bak|cater/i, ChefHat],
  [/fashion|tailor|cloth|stylist|wear/i, Shirt],
  [/act|drama|theat|model|comedian|mc\b/i, Drama],
  [/book/i, BookOpen],
  [/event|plan|wedding/i, CalendarDays],
];

export function profileTabIcon(tabId: string, label: string): LucideIcon {
  const fixed = FIXED_TAB_ICONS[tabId];
  if (fixed) return fixed;
  for (const [pattern, icon] of CATEGORY_KEYWORDS) {
    if (pattern.test(label)) return icon;
  }
  return Briefcase;
}
