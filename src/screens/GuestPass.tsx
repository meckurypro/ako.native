// src/screens/GuestPass.tsx
// /pass/:token — the public face of a Guest Pass (port of the web page). Anyone with the link sees the project's
// content, signed in or not, for as long as the pass lives, with a live countdown. When it runs out (or was revoked)
// the content is withdrawn on the spot and the visitor gets an "expired" screen with a relevant next step.
// Hosted audio / video / files / book files open in the system browser via a short-lived signed URL.
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Clock, Download, ExternalLink, KeyRound, Lock, Play } from "lucide-react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookRichText } from "@/components/project/book/BookRichText";
import { Avatar } from "@/components/ui/Avatar";
import { Image, Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { Wordmark } from "@/components/ui/Wordmark";
import { useAuth } from "@/hooks/useAuth";
import { useCountdown } from "@/hooks/useCountdown";
import { GuestPassExpiredError, useGuestPassFile, useGuestPassView, usePassDeadline, type GuestPassView } from "@/hooks/useGuestPass";
import { PROJECT_TYPE_LABELS, type ProjectType } from "@/hooks/useProjects";
import { rememberReturnTo } from "@/lib/authRedirect";
import { formatFileSize } from "@/lib/chatMedia";
import { formatPassRemaining, safeHref } from "@/lib/guestPass";
import { getProjectPath } from "@/lib/projectLinks";
import { useTheme } from "@/theme/ThemeProvider";
import { friendlyError } from "@/lib/friendlyError";

function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="h-14 flex-row items-center justify-between border-b border-border bg-surface px-4">
        <Wordmark size="sm" />
        {right}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 48 }}>{children}</ScrollView>
    </View>
  );
}

function CountdownPill({ remainingMs }: { remainingMs: number | null }) {
  if (remainingMs === null) return null;
  const tone = remainingMs < 60_000 ? "text-danger" : remainingMs < 600_000 ? "text-pushback" : "text-ink";
  return (
    <View className="flex-row items-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-1" accessibilityRole="timer">
      <Icon as={Clock} size={13} className="text-ink-muted" />
      <Text className="text-xs text-ink-muted">Link ends in</Text>
      <Text className={`text-xs font-medium ${tone}`}>{formatPassRemaining(remainingMs)}</Text>
    </View>
  );
}

function PillButton({ onPress, children, soft, disabled }: { onPress: () => void; children: ReactNode; soft?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`flex-row items-center gap-2 self-start rounded-full px-5 py-2.5 ${soft ? "bg-accent-soft" : "bg-accent"} ${disabled ? "opacity-60" : ""}`}
    >
      {children}
    </Pressable>
  );
}

function goAuth(path: string | null) {
  rememberReturnTo(path);
  router.push("/signup" as Href);
}

// ------------------------------------------------------------ expired / invalid
function EndedScreen({ view, signedIn }: { view: GuestPassView | undefined; signedIn: boolean }) {
  const status = view?.status ?? "not_found";
  const creator = view?.page?.name ?? view?.creator?.display_name ?? view?.creator?.username ?? null;
  const username = view?.page ? view.page.username : view?.creator?.username ?? null;
  const profilePath = username ? (view?.page ? `/page/${username}` : `/profile/${username}`) : null;
  const publicPath = view?.project_id ? getProjectPath({ id: view.project_id, slug: view.project_slug }) : null;

  const heading =
    status === "revoked" ? "This link was turned off"
    : status === "unavailable" ? "This project isn't available anymore"
    : status === "not_found" ? "This link isn't valid"
    : "This link has expired";
  const body =
    status === "not_found" ? "Check that the whole link was copied, or ask whoever sent it to share it again."
    : status === "unavailable" ? "The creator has taken it down."
    : `Guest links only work for a short while.${creator ? ` Ask ${creator} for a fresh one.` : " Ask the creator for a fresh one."}`;

  return (
    <Shell>
      <View className="items-center pt-10">
        <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
          <Icon as={Clock} size={26} className="text-accent" />
        </View>
        <Text className="text-center font-display text-xl font-semibold text-ink">{heading}</Text>
        {view?.project_title ? <Text className="mt-2 text-center text-sm font-medium text-ink">{view.project_title}</Text> : null}
        <Text className="mt-2 max-w-xs text-center text-sm text-ink-muted">{body}</Text>

        <View className="mt-7 w-full max-w-xs gap-2.5">
          {profilePath && status !== "not_found" ? (
            <Pressable
              onPress={() => (signedIn ? router.push(profilePath as Href) : goAuth(profilePath))}
              className="items-center rounded-xl bg-accent py-3"
            >
              <Text className="text-sm font-medium text-canvas">
                {signedIn ? `Message ${creator ?? "the creator"} for a new link` : `Join Akọ to ask ${creator ?? "the creator"}`}
              </Text>
            </Pressable>
          ) : null}
          {publicPath ? (
            <Pressable onPress={() => router.push(publicPath as Href)} className="items-center rounded-xl bg-accent-soft py-3">
              <Text className="text-sm font-medium text-accent">View the project page</Text>
            </Pressable>
          ) : null}
          {!signedIn ? (
            <Pressable onPress={() => router.push("/login" as Href)} className="items-center py-2">
              <Text className="text-sm font-medium text-accent">I already have an account</Text>
            </Pressable>
          ) : null}
          {signedIn && !profilePath ? (
            <Pressable onPress={() => router.replace("/feed" as Href)} className="items-center rounded-xl bg-accent py-3">
              <Text className="text-sm font-medium text-canvas">Go to your feed</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Shell>
  );
}

// ------------------------------------------------------------ content
function openLink(href: string | null) {
  if (href) void WebBrowser.openBrowserAsync(href);
}

function LinkButton({ href, children }: { href: string | null; children: string }) {
  if (!href) return null;
  return (
    <PillButton onPress={() => openLink(href)}>
      <Icon as={ExternalLink} size={15} className="text-canvas" />
      <Text className="text-sm font-medium text-canvas">{children}</Text>
    </PillButton>
  );
}

/** Fetches a signed URL on demand and hands it to the system browser; an expiry answer flips the page to "expired". */
function useFileOpener(token: string, onExpired: () => void) {
  const fetcher = useGuestPassFile(token);
  const toast = useToast();
  async function open(args: Parameters<typeof fetcher.mutateAsync>[0]) {
    try {
      const r = await fetcher.mutateAsync(args);
      await WebBrowser.openBrowserAsync(r.url);
    } catch (e) {
      if (e instanceof GuestPassExpiredError) onExpired();
      else toast(friendlyError(e, "Couldn't open that file."), { variant: "error" });
    }
  }
  return { open, pending: fetcher.isPending };
}

function MediaContent({ detail, token, onExpired }: { detail: GuestPassView["detail"]; token: string; onExpired: () => void }) {
  const d = detail ?? {};
  const { open, pending } = useFileOpener(token, onExpired);
  const channels = [
    { kind: "video" as const, label: "Video", action: "Play video" },
    { kind: "audio" as const, label: "Audio", action: "Play audio" },
    { kind: "image" as const, label: "Image", action: "Open image" },
  ];
  return (
    <View className="gap-5">
      {channels.map(({ kind, label, action }) => {
        if (!d[`has_${kind}`]) return null;
        const hosted = !!d[`${kind}_hosted`];
        const href = safeHref(d[`${kind}_url`]);
        return (
          <View key={kind}>
            <Text className="mb-2 text-xs font-medium uppercase text-ink-muted">{label}</Text>
            {hosted ? (
              <PillButton disabled={pending} onPress={() => void open({ kind, action: "stream" })}>
                <Icon as={Play} size={15} className="text-canvas" />
                <Text className="text-sm font-medium text-canvas">{pending ? "Loading…" : action}</Text>
              </PillButton>
            ) : (
              <LinkButton href={href}>{kind === "audio" ? "Listen" : kind === "video" ? "Watch" : "Open image"}</LinkButton>
            )}
          </View>
        );
      })}
    </View>
  );
}

function FileContent({ detail, token, onExpired }: { detail: GuestPassView["detail"]; token: string; onExpired: () => void }) {
  const files = (detail?.files ?? []) as { id: string; name: string; size_bytes: number | null }[];
  const { open, pending } = useFileOpener(token, onExpired);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (!files.length) return <Text className="text-sm text-ink-muted">Nothing has been uploaded yet.</Text>;
  return (
    <View className="gap-2">
      {files.map((f) => (
        <View key={f.id} className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3">
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-medium text-ink">{f.name}</Text>
            {f.size_bytes ? <Text className="text-xs text-ink-muted">{formatFileSize(f.size_bytes)}</Text> : null}
          </View>
          <Pressable
            disabled={pending}
            onPress={async () => {
              setBusyId(f.id);
              await open({ kind: "file", fileId: f.id });
              setBusyId(null);
            }}
            className={`flex-row items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 ${pending ? "opacity-60" : ""}`}
          >
            <Icon as={Download} size={14} className="text-canvas" />
            <Text className="text-sm font-medium text-canvas">{busyId === f.id ? "Preparing…" : "Download"}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [openState, setOpen] = useState(false);
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-surface">
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: openState }} className="flex-row items-center justify-between gap-2 px-4 py-3">
        <Text className="flex-1 text-sm font-medium text-ink">{title}</Text>
        <Icon as={ChevronDown} size={16} className="text-ink-muted" />
      </Pressable>
      {openState ? <View className="px-4 pb-4">{children}</View> : null}
    </View>
  );
}

function BookContent({ detail, token, onExpired }: { detail: GuestPassView["detail"]; token: string; onExpired: () => void }) {
  const { colors } = useTheme();
  const d = detail ?? {};
  const chapters = (d.chapters ?? []) as { id: string; title: string | null; content: string | null }[];
  const { open, pending } = useFileOpener(token, onExpired);
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {d.hosted && d.allow_read_in_app ? (
          <PillButton disabled={pending} onPress={() => void open({ kind: "book", action: "stream" })}>
            <Icon as={Play} size={15} className="text-canvas" />
            <Text className="text-sm font-medium text-canvas">Read the book</Text>
          </PillButton>
        ) : null}
        {d.hosted && d.allow_download ? (
          <PillButton soft disabled={pending} onPress={() => void open({ kind: "book", action: "download" })}>
            <Icon as={Download} size={15} className="text-accent" />
            <Text className="text-sm font-medium text-accent">Download</Text>
          </PillButton>
        ) : null}
        <LinkButton href={safeHref(d.external_url)}>Open the book</LinkButton>
      </View>
      {chapters.map((c, i) =>
        c.content ? (
          <Disclosure key={c.id} title={c.title || `Chapter ${i + 1}`}>
            <BookRichText content={c.content} ink={colors.ink} muted={colors.inkMuted} accent={colors.accent} fontSize={16} />
          </Disclosure>
        ) : null,
      )}
    </View>
  );
}

function CourseContent({ detail }: { detail: GuestPassView["detail"] }) {
  const modules = (detail?.modules ?? []) as {
    id: string;
    title: string;
    lessons: { id: string; title: string; content: string | null; media_url: string | null }[];
  }[];
  if (!modules.length) return <Text className="text-sm text-ink-muted">The course has no lessons yet.</Text>;
  return (
    <View className="gap-4">
      {modules.map((m) => (
        <View key={m.id}>
          <Text className="mb-2 text-xs font-medium uppercase text-ink-muted">{m.title}</Text>
          <View className="gap-2">
            {m.lessons.map((l) => (
              <Disclosure key={l.id} title={l.title}>
                {l.content ? <Text className="text-sm text-ink">{l.content}</Text> : null}
                {safeHref(l.media_url) ? (
                  <View className="mt-3">
                    <LinkButton href={safeHref(l.media_url)}>Open lesson media</LinkButton>
                  </View>
                ) : null}
                {!l.content && !l.media_url ? <Text className="text-sm text-ink-muted">No content in this lesson.</Text> : null}
              </Disclosure>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// Live-participation types: the pass shows what they are; taking part (tickets, rooms, calls, booking, backing) is an
// account thing.
function ParticipationNote({ type, detail }: { type: string; detail: GuestPassView["detail"] }) {
  const d = detail ?? {};
  const when = (d.event_date ?? d.scheduled_at) as string | undefined;
  return (
    <View className="rounded-2xl border border-border bg-surface px-4 py-3.5">
      {when ? <Text className="mb-1 text-sm font-medium text-ink">{new Date(when).toLocaleString()}</Text> : null}
      {type === "gig" && d.tagline ? <Text className="mb-1 text-sm font-medium text-ink">{d.tagline}</Text> : null}
      {type === "gig" && d.delivery_estimate ? <Text className="text-sm text-ink-muted">Delivery: {d.delivery_estimate}</Text> : null}
      {Array.isArray(d.deliverables)
        ? d.deliverables.map((x: string, i: number) => (
            <Text key={i} className="mt-1 text-sm text-ink-muted">
              • {x}
            </Text>
          ))
        : null}
      <View className="mt-2 flex-row items-center gap-1.5">
        <Icon as={Lock} size={13} className="text-ink-muted" />
        <Text className="text-sm text-ink-muted">
          Taking part in this {PROJECT_TYPE_LABELS[type as ProjectType]?.toLowerCase() ?? "project"} needs an Akọ account.
        </Text>
      </View>
    </View>
  );
}

// ------------------------------------------------------------ screen
export function GuestPass() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useGuestPassView(token);
  const view = query.data;
  const deadline = usePassDeadline(view, query.dataUpdatedAt || undefined);
  const remaining = useCountdown(view?.status === "valid" ? deadline : null);
  const [forcedEnd, setForcedEnd] = useState(false);

  const ended = forcedEnd || (remaining !== null && remaining <= 0);
  // Drop the cached content the moment time is up so it can't be shown again from memory.
  useEffect(() => {
    if (ended && token) queryClient.removeQueries({ queryKey: ["guest-pass", token] });
  }, [ended, token, queryClient]);

  if (query.isLoading) {
    return (
      <Shell>
        <View className="h-48 rounded-2xl border border-border bg-surface" />
        <View className="mt-5 h-6 w-2/3 rounded bg-surface" />
      </Shell>
    );
  }

  if (query.isError) {
    return (
      <Shell>
        <View className="items-center pt-14">
          <Text className="font-display text-xl font-semibold text-ink">Couldn&apos;t open this link</Text>
          <Text className="mt-2 text-sm text-ink-muted">Check your connection and try again.</Text>
          <Pressable onPress={() => void query.refetch()} className="mt-5">
            <Text className="text-sm font-medium text-accent">Retry</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  if (ended) {
    // Keep a minimal snapshot of who made it so the expired screen can offer a relevant next step.
    const snapshot: GuestPassView | undefined =
      view?.status === "valid" && view.project
        ? {
            status: "expired",
            server_now: view.server_now,
            creator: view.creator,
            page: view.page,
            project_title: view.project.is_private ? null : view.project.title,
            project_id: view.project.is_private ? null : view.project.id,
            project_slug: view.project.is_private ? null : view.project.slug,
          }
        : view;
    return <EndedScreen view={snapshot} signedIn={!!user} />;
  }

  if (!view || view.status !== "valid" || !view.project || !token) return <EndedScreen view={view} signedIn={!!user} />;

  const p = view.project;
  const type = p.project_type;
  const owner = view.page
    ? { name: view.page.name, avatar: view.page.avatar_url }
    : { name: view.creator?.display_name || view.creator?.username || "", avatar: view.creator?.avatar_url ?? null };
  const onExpired = () => setForcedEnd(true);
  const extraImages = (p.supporting_image_urls ?? []).filter(Boolean);

  return (
    <Shell right={<CountdownPill remainingMs={remaining} />}>
      <View className="mb-3 flex-row items-center gap-1.5">
        <Icon as={KeyRound} size={13} className="text-accent" />
        <Text className="text-xs text-ink-muted">Guest pass — you&apos;re viewing this without an account</Text>
      </View>

      {p.thumbnail_url ? <Image source={{ uri: p.thumbnail_url }} contentFit="cover" style={{ width: "100%", height: 240, borderRadius: 16 }} /> : null}

      <View className="mt-4 flex-row items-center gap-2">
        <View className="rounded-full bg-accent-soft px-2.5 py-0.5">
          <Text className="text-xs font-medium text-accent">{PROJECT_TYPE_LABELS[type as ProjectType] ?? type}</Text>
        </View>
        {p.is_private ? (
          <View className="flex-row items-center gap-1 rounded-full border border-border bg-canvas px-2.5 py-0.5">
            <Icon as={Lock} size={11} className="text-ink-muted" />
            <Text className="text-xs text-ink-muted">Private</Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-2 font-display text-2xl font-semibold text-ink">{p.title}</Text>
      {owner.name ? (
        <View className="mt-2 flex-row items-center gap-2">
          <Avatar src={owner.avatar} name={owner.name} size="sm" />
          <Text className="text-sm text-ink-muted">{owner.name}</Text>
        </View>
      ) : null}
      {p.description ? <Text className="mt-4 text-sm text-ink-muted">{p.description}</Text> : null}

      {extraImages.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4" contentContainerStyle={{ gap: 8 }}>
          {extraImages.map((src, i) => (
            <Image key={i} source={{ uri: src }} contentFit="cover" style={{ width: 160, height: 160, borderRadius: 12 }} />
          ))}
        </ScrollView>
      ) : null}

      <View className="mt-6">
        {type === "url" ? <LinkButton href={safeHref(p.external_url)}>Open link</LinkButton> : null}
        {type === "media" ? <MediaContent detail={view.detail} token={token} onExpired={onExpired} /> : null}
        {type === "file" ? <FileContent detail={view.detail} token={token} onExpired={onExpired} /> : null}
        {type === "book" ? <BookContent detail={view.detail} token={token} onExpired={onExpired} /> : null}
        {type === "course" ? <CourseContent detail={view.detail} /> : null}
        {["event", "meeting", "room", "gig", "pitch"].includes(type) ? <ParticipationNote type={type} detail={view.detail} /> : null}
      </View>

      {!user ? (
        <View className="mt-10 items-center rounded-2xl bg-accent-soft px-5 py-5">
          <Text className="text-sm font-medium text-ink">Like what you see?</Text>
          <Text className="mt-1 text-center text-xs text-ink-muted">Akọ is where people say, make, teach, host and share.</Text>
          <Pressable onPress={() => goAuth(p.slug ? getProjectPath({ id: p.id, slug: p.slug }) : null)} className="mt-3 rounded-full bg-accent px-5 py-2">
            <Text className="text-sm font-medium text-canvas">Join Akọ</Text>
          </Pressable>
        </View>
      ) : null}
    </Shell>
  );
}
