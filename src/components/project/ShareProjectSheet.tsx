// src/components/project/ShareProjectSheet.tsx
//
// In-app "share to another user or community" for a project on Connect / Library. It sends the project's public page
// link (the /:slug page, or /projects/:id when it has no slug yet) as a normal chat message, so whoever opens it lands
// on the project's own page, where access is decided the usual way. A shared link never hands over the ticket, the
// reader or the files themselves.
//
// People are the person's existing conversations (same list the forward sheet uses); communities are the groups they
// are in or run, reached through the group's own chat.
import { useQuery } from "@tanstack/react-query";
import { Search, Send } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { SheetFrame } from "@/components/ui/SheetFrame";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useConversations, useForwardMessages } from "@/hooks/useMessaging";
import { getProjectUrl } from "@/lib/projectLinks";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/theme/ThemeProvider";

interface ShareProjectSheetProps {
  projectId: string;
  title: string;
  slug: string | null;
  onClose: () => void;
  onSent: () => void;
}

interface MyGroup {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

// The groups this person is a member of, owns or helps host.
function useMyGroups() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["share-target-groups", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MyGroup[]> => {
      const [members, owned, mods] = await Promise.all([
        supabase.from("room_members").select("project_id").eq("user_id", user!.id),
        supabase.from("projects").select("id").eq("owner_id", user!.id).eq("project_type", "room"),
        supabase.from("room_moderators").select("project_id").eq("user_id", user!.id),
      ]);
      const ids = new Set<string>();
      for (const r of (members.data as { project_id: string }[] | null) ?? []) ids.add(r.project_id);
      for (const r of (owned.data as { id: string }[] | null) ?? []) ids.add(r.id);
      for (const r of (mods.data as { project_id: string }[] | null) ?? []) ids.add(r.project_id);
      if (!ids.size) return [];
      const { data } = await supabase
        .from("projects")
        .select("id, title, thumbnail_url")
        .in("id", [...ids])
        .eq("is_active", true)
        .order("title", { ascending: true });
      return (data as MyGroup[] | null) ?? [];
    },
  });
}

function PickRow({ selected, name, src, onPress }: { selected: boolean; name: string; src: string | null; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} className="flex-row items-center gap-3 px-1 py-2.5 active:bg-canvas">
      <Avatar src={src} name={name} size="sm" />
      <Text numberOfLines={1} className="min-w-0 flex-1 text-sm text-ink">
        {name}
      </Text>
      <View className={`h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-accent bg-accent" : "border-border"}`}>
        {selected ? <View className="h-2 w-2 rounded-full bg-canvas" /> : null}
      </View>
    </Pressable>
  );
}

export function ShareProjectSheet({ projectId, title, slug, onClose, onSent }: ShareProjectSheetProps) {
  const { colors } = useTheme();
  const { data: conversations, isLoading: loadingPeople } = useConversations();
  const { data: groups, isLoading: loadingGroups } = useMyGroups();
  const forwardMessages = useForwardMessages();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  const people = useMemo(() => {
    const direct = (conversations ?? []).filter((c) => !c.is_group);
    if (!q) return direct;
    return direct.filter((c) => c.other_participant.display_name.toLowerCase().includes(q) || c.other_participant.username.toLowerCase().includes(q));
  }, [conversations, q]);

  // A group's own page is not something to share into itself.
  const communities = useMemo(() => {
    const list = (groups ?? []).filter((g) => g.id !== projectId);
    return q ? list.filter((g) => g.title.toLowerCase().includes(q)) : list;
  }, [groups, q, projectId]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSend() {
    if (!selected.size) return;
    setError(null);
    try {
      const conversationIds: string[] = [];
      for (const key of selected) {
        if (key.startsWith("dm:")) {
          conversationIds.push(key.slice(3));
        } else {
          // A group's chat is created the first time it is needed, so resolve it now.
          const { data, error: rpcError } = await supabase.rpc("get_or_create_room_conversation", { p_project_id: key.slice(6) });
          if (rpcError || !data) throw rpcError ?? new Error("no conversation");
          conversationIds.push(data as string);
        }
      }
      await forwardMessages.mutateAsync({ messages: [{ content: `${title}\n${getProjectUrl({ id: projectId, slug })}` }], targetConversationIds: conversationIds });
      onSent();
    } catch {
      setError("Couldn't share that. Check your connection and try again.");
    }
  }

  const loading = loadingPeople || loadingGroups;
  const empty = !loading && !people.length && !communities.length;
  const busy = forwardMessages.isPending;

  return (
    <SheetFrame
      title={`Share ${title}`}
      onClose={onClose}
      zIndex={60}
      avoidKeyboard
      heightRatio={0.75}
      footer={
        <View>
          <Text className="pb-2 text-center text-xs text-ink-muted">They get a link to its page.</Text>
          {error ? <Text className="pb-2 text-center text-xs text-danger">{error}</Text> : null}
          <Pressable
            onPress={() => void handleSend()}
            disabled={!selected.size || busy}
            accessibilityRole="button"
            className={`flex-row items-center justify-center gap-2 rounded-full bg-cta py-3 ${!selected.size || busy ? "opacity-50" : ""}`}
          >
            <Icon as={Send} size={16} className="text-white" />
            <Text className="text-sm font-medium text-white">{busy ? "Sending…" : selected.size ? `Send to ${selected.size}` : "Select who to send to"}</Text>
          </Pressable>
        </View>
      }
    >
      <View className="mb-2 flex-row items-center rounded-full border border-border bg-canvas px-3.5">
        <Icon as={Search} size={16} className="shrink-0 text-ink-muted" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people and communities…"
          placeholderTextColor={colors.inkMuted}
          selectionColor={colors.accent}
          autoCapitalize="none"
          autoCorrect={false}
          className="ml-2.5 flex-1 py-2.5 text-sm text-ink"
          style={{ fontFamily: "Inter_400Regular" }}
        />
      </View>

      {loading ? (
        <Text className="py-8 text-center text-sm text-ink-muted">Loading…</Text>
      ) : empty ? (
        <Text className="py-8 text-center text-sm text-ink-muted">Nobody to share with yet.</Text>
      ) : (
        <>
          {people.length > 0 ? (
            <>
              <Text className="px-1 pb-1 pt-2 text-xs font-medium text-ink-muted">People</Text>
              {people.map((c) => (
                <PickRow key={c.id} selected={selected.has(`dm:${c.id}`)} name={c.other_participant.display_name} src={c.other_participant.avatar_url} onPress={() => toggle(`dm:${c.id}`)} />
              ))}
            </>
          ) : null}
          {communities.length > 0 ? (
            <>
              <Text className="px-1 pb-1 pt-3 text-xs font-medium text-ink-muted">Communities</Text>
              {communities.map((g) => (
                <PickRow key={g.id} selected={selected.has(`group:${g.id}`)} name={g.title} src={g.thumbnail_url} onPress={() => toggle(`group:${g.id}`)} />
              ))}
            </>
          ) : null}
        </>
      )}
    </SheetFrame>
  );
}
