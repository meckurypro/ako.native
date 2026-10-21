// src/components/ui/RoleSelect.tsx
// The role field on Create a page and on team invites. A field showing the chosen role that opens a bottom sheet
// with a search box and the admin-managed roles (A→Z, one smooth virtualised list). A role that isn't in the list can
// simply be typed and used: it goes to the Akọ team for approval and shows as the generic title until they decide
// (see supabase/ako_page_roles_catalogue.sql).
import { Check, ChevronDown, Plus, Search } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";

import { usePageRoles } from "@/hooks/usePages";
import { GENERIC_ROLE_LABEL, findRole } from "@/lib/pageRoles";
import { useTheme } from "@/theme/ThemeProvider";
import { SheetFrame } from "./SheetFrame";
import { SheetRow } from "./SheetParts";
import { Icon } from "./styled";
import { Text } from "./Text";

interface RoleSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Small label above the field. Omit where the surrounding card already says what it is. */
  label?: string;
  placeholder?: string;
  /** Only changes the wording of the approval note ("your title" vs "their title"). */
  subject?: "you" | "them";
  /** Classes for the field box (background, padding). */
  fieldClassName?: string;
  /** Rendered under the field (hints, previews). */
  children?: ReactNode;
}

type Row = { kind: "custom" } | { kind: "role"; label: string };

function RolePicker({ title, value, onChange, onClose }: { title: string; value: string; onChange: (v: string) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const { data: roles = [], isLoading } = usePageRoles();
  const [query, setQuery] = useState("");

  const typed = query.trim().replace(/\s+/g, " ");
  const exact = findRole(roles, typed);
  const current = findRole(roles, value);

  const rows = useMemo<Row[]>(() => {
    const q = typed.toLowerCase();
    const matches = q ? roles.filter((r) => r.toLowerCase().includes(q)) : roles;
    // "Use “…”" goes first when what you typed isn't in the list, so it is never buried under a long scroll.
    return [...(typed && !exact ? [{ kind: "custom" } as Row] : []), ...matches.map((label): Row => ({ kind: "role", label }))];
  }, [roles, typed, exact]);

  return (
    <SheetFrame title={title} subtitle="Pick one, or type your own" onClose={onClose} avoidKeyboard heightRatio={0.7} bodyScroll={false}>
      <View className="flex-1">
        <View className="mx-4 mb-1 mt-3 flex-row items-center rounded-full border border-border bg-canvas px-3.5">
          <Icon as={Search} size={16} className="shrink-0 text-ink-muted" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search or type a role…"
            placeholderTextColor={`${colors.inkMuted}99`}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={60}
            returnKeyType="done"
            className="ml-2.5 flex-1 py-2.5 text-sm text-ink"
            style={{ fontFamily: "Inter_400Regular" }}
          />
        </View>

        <FlatList showsHorizontalScrollIndicator={false}
          data={rows}
          keyExtractor={(row) => (row.kind === "custom" ? "__custom" : row.label)}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          initialNumToRender={20}
          windowSize={7}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListEmptyComponent={
            <Text className="px-4 py-8 text-center text-sm text-ink-muted">{isLoading ? "Loading roles…" : "No roles yet — type yours above."}</Text>
          }
          renderItem={({ item }) =>
            item.kind === "custom" ? (
              <SheetRow
                label={`Use “${typed}”`}
                description={`Sent to the Akọ team for approval · shows as ${GENERIC_ROLE_LABEL} until then`}
                icon={<Icon as={Plus} size={16} className="text-accent" />}
                onPress={() => onChange(typed)}
              />
            ) : (
              <SheetRow
                label={item.label}
                icon={current === item.label ? <Icon as={Check} size={16} className="text-accent" /> : undefined}
                onPress={() => onChange(item.label)}
              />
            )
          }
        />
      </View>
    </SheetFrame>
  );
}

export function RoleSelect({
  value,
  onChange,
  label,
  placeholder = "Select a role…",
  subject = "you",
  fieldClassName = "rounded-xl bg-surface px-4 py-3",
  children,
}: RoleSelectProps) {
  const { data: roles = [] } = usePageRoles();
  const [open, setOpen] = useState(false);

  const typed = value.trim();
  const isCustom = typed.length > 0 && !findRole(roles, typed);

  return (
    <View>
      {label ? <Text className="mb-1 text-xs font-medium text-ink-muted">{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? "Role"}: ${typed || placeholder}`}
        className={`flex-row items-center justify-between ${fieldClassName}`}
      >
        <Text numberOfLines={1} className={`flex-1 text-sm ${typed ? "text-ink" : "text-ink-muted"}`}>
          {typed || placeholder}
        </Text>
        <Icon as={ChevronDown} size={16} className="ml-2 text-ink-muted" />
      </Pressable>

      {isCustom ? (
        <Text className="mt-1 text-xs text-ink-muted">
          {`“${typed}” isn’t in the list yet, so the Akọ team will review it. Until it’s approved, ${subject === "them" ? "their" : "your"} title shows as ${GENERIC_ROLE_LABEL}.`}
        </Text>
      ) : null}
      {children}

      {open ? <RolePicker title={label ?? "Role"} value={value} onChange={onChange} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}
