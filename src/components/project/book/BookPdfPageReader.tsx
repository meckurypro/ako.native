// src/components/project/book/BookPdfPageReader.tsx
//
// Page-image reader for an uploaded PDF that can't reflow: a flyer, a scan, a photo book — anything with no usable
// text layer, or a book the extractor hasn't processed. It is the native twin of the web BookPdfPageReader.
//
//   - pages are drawn by pdf.js inside a WebView (src/lib/pdfPageViewerHtml.ts) — pinch-zoom, pan, double-tap zoom,
//     swipe / tap-zone page turns; tap the middle to show or hide the bars
//   - dark themes never invert a picture-only page (that turned faces into negatives); they dim it instead
//   - same access rules as the reflow reader (owner / free / purchased / private-project member), and the same
//     get-project-file call, so a host who turned off in-app reading is refused server-side too
//   - reading position (page) is saved debounced and flushed when the app is backgrounded; reopening offers to resume
import Slider from "@react-native-community/slider";
import { StatusBar } from "expo-status-bar";
import { ChevronLeft, SlidersHorizontal } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { BookLockedView } from "@/components/project/book/BookLockedView";
import { Sheet } from "@/components/project/book/ReaderSheets";
import { Button } from "@/components/ui/Button";
import { ResumePrompt } from "@/components/ui/ResumePrompt";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/hooks/useAuth";
import { useBookReaderTheme } from "@/hooks/useBookReaderTheme";
import { useProjectOwnership } from "@/hooks/useProjectOwnership";
import { useRecordFreeProjectOpen } from "@/hooks/useProjectAccess";
import { useIsProjectMember } from "@/hooks/useProjectMembers";
import { usePdfReadingProgress, useSavePdfReadingProgress } from "@/hooks/useProjectTypeDetails";
import { getEffectivePrice, isProjectFree, useGetProjectFile, useHasPurchased, useProject, usePurchaseProject } from "@/hooks/useProjects";
import { useSmartBack } from "@/hooks/useSmartBack";
import { READER_THEMES, type ReaderThemeId, type ReaderThemeSpec } from "@/lib/bookReaderTheme";
import { resolveFunctionErrorMessage } from "@/lib/functionErrors";
import { PDF_VIEWER_BASE_URL, buildPdfViewerHtml } from "@/lib/pdfPageViewerHtml";

const SAVE_DEBOUNCE_MS = 900;
const BRIGHTNESS_KEY = "ako-reader-brightness";
const THEME_ORDER: ReaderThemeId[] = ["original", "quiet", "paper", "calm", "bold", "focus"];

type ViewerMessage =
  | { t: "ready"; lib: boolean }
  | { t: "loaded"; pages: number }
  | { t: "page"; n: number; pictorial: boolean }
  | { t: "tap" }
  | { t: "zoom"; s: number }
  | { t: "edge"; dir: number }
  | { t: "error"; code: string; message: string };

function readBrightness(): number {
  try {
    const n = Number(localStorage.getItem(BRIGHTNESS_KEY));
    return n >= 40 && n <= 100 ? n : 100;
  } catch {
    return 100;
  }
}

/** CSS filters for the page canvas. A picture-only page is dimmed, never inverted, in a dark theme. */
function viewerStyle(theme: ReaderThemeSpec, brightness: number) {
  let text = "none";
  let pictorial = "none";
  if (theme.dark) {
    text = "invert(0.92) hue-rotate(180deg) brightness(0.92) contrast(0.88)";
    pictorial = "brightness(0.8) contrast(0.95)";
  } else if (theme.id === "calm") {
    text = pictorial = "sepia(0.35) brightness(0.97) contrast(0.97)";
  } else if (theme.id === "paper") {
    text = pictorial = "sepia(0.12) brightness(0.97)";
  }
  const b = brightness < 100 ? ` brightness(${brightness / 100})` : "";
  return {
    bg: theme.bg,
    filterText: text === "none" ? b.trim() || "none" : text + b,
    filterPictorial: pictorial === "none" ? b.trim() || "none" : pictorial + b,
  };
}

export function BookPdfPageReader({ projectId }: { projectId: string }) {
  const insets = useSafeAreaInsets();
  const back = useSmartBack();
  const { user } = useAuth();

  const { data: project } = useProject(projectId);
  const ownership = useProjectOwnership();
  const hasPurchasedQuery = useHasPurchased(projectId);
  const isMemberQuery = useIsProjectMember(projectId, project?.is_private ?? false);
  const purchaseProject = usePurchaseProject();
  const getBookFile = useGetProjectFile();
  const { data: savedProgress, isLoading: progressLoading } = usePdfReadingProgress(projectId, user?.id);
  const saveProgress = useSavePdfReadingProgress(projectId, user?.id);

  const isOwner = ownership.isOwner(project);
  const isCreator = !!user && project?.owner_id === user.id;
  const isFree = !!project && isProjectFree(project);
  const privacyBlocked = !!project?.is_private && !isOwner && !isMemberQuery.data;
  const hasAccess = !privacyBlocked && (isOwner || isFree || !!hasPurchasedQuery.data);
  useRecordFreeProjectOpen(project, { isOwner: isCreator, enabled: !privacyBlocked });

  const [themeId, setThemeId] = useBookReaderTheme();
  const theme = READER_THEMES[themeId];
  const [brightness, setBrightness] = useState(readBrightness);
  const [chrome, setChrome] = useState(true);
  const [sheet, setSheet] = useState(false);

  const [url, setUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0); // bumping this reloads the WebView and re-signs the URL

  const webRef = useRef<WebView>(null);
  const opened = useRef(false);
  const html = useMemo(() => buildPdfViewerHtml(), []);
  const style = useMemo(() => viewerStyle(theme, brightness), [theme, brightness]);
  const styleRef = useRef(style);
  styleRef.current = style;

  const [resumeApplied, setResumeApplied] = useState(false);
  const [resumeOffer, setResumeOffer] = useState<{ page: number } | null>(null);
  const startPage = useRef(1);

  const send = useCallback((cmd: object) => {
    // JSON.stringify keeps the signed URL (and everything else) inert — it is data, never code.
    webRef.current?.injectJavaScript(`window.__ako&&window.__ako.cmd(${JSON.stringify(cmd)});true;`);
  }, []);

  // Mint the signed streaming URL once access is confirmed. get-project-file also enforces allow_read_in_app.
  useEffect(() => {
    if (!hasAccess) return;
    let cancelled = false;
    setUrl(null);
    setUrlError(null);
    getBookFile
      .mutateAsync({ projectId, kind: "book", action: "stream" })
      .then((u) => !cancelled && setUrl(u))
      .catch(async (err) => !cancelled && setUrlError(await resolveFunctionErrorMessage(err, "Couldn't open this book.")));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, hasAccess, attempt]);

  // Offer to resume once the saved page and the page count are both known. Nothing is saved until that choice is
  // made, so the offer can't be overwritten by the page the reader happens to be showing.
  useEffect(() => {
    if (resumeApplied || resumeOffer || numPages === 0 || progressLoading) return;
    const saved = savedProgress?.current_page;
    if (saved && saved > 1) setResumeOffer({ page: Math.min(Math.max(1, saved), numPages) });
    else setResumeApplied(true);
  }, [numPages, savedProgress, progressLoading, resumeApplied, resumeOffer]);

  // Open the document when both the viewer and the URL are ready. Resume is asked after the page count is known,
  // so the first page loads straight away and "Continue" jumps.
  useEffect(() => {
    if (!viewerReady || !url || opened.current) return;
    opened.current = true;
    send({ t: "open", url, page: startPage.current, style: styleRef.current });
  }, [viewerReady, url, send]);

  useEffect(() => {
    if (viewerReady) send({ t: "style", style });
  }, [style, viewerReady, send]);

  useEffect(() => {
    try {
      localStorage.setItem(BRIGHTNESS_KEY, String(brightness));
    } catch {
      /* the setting just won't persist */
    }
  }, [brightness]);

  // Debounced save, flushed on background and on unmount.
  const latest = useRef({ page: 1, total: 0, ok: false });
  latest.current = { page, total: numPages, ok: !!user && numPages > 0 && resumeApplied };
  const saveMutate = saveProgress.mutate;
  useEffect(() => {
    if (!latest.current.ok) return;
    const id = setTimeout(() => saveMutate({ currentPage: page, totalPages: numPages }), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [page, numPages, resumeApplied, saveMutate]);
  useEffect(() => {
    const flush = () => {
      const l = latest.current;
      if (l.ok) saveMutate({ currentPage: l.page, totalPages: l.total });
    };
    const sub = AppState.addEventListener("change", (s) => s !== "active" && flush());
    return () => {
      sub.remove();
      flush();
    };
  }, [saveMutate]);

  function onMessage(e: WebViewMessageEvent) {
    let m: ViewerMessage;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    switch (m.t) {
      case "ready":
        if (m.lib) setViewerReady(true);
        else setViewerError("The reader couldn't load. Check your connection and try again.");
        break;
      case "loaded":
        setNumPages(m.pages);
        break;
      case "page":
        setPage(m.n);
        break;
      case "tap":
        setChrome((c) => !c);
        break;
      case "error":
        setViewerError(m.message);
        break;
    }
  }

  function retry() {
    opened.current = false;
    setViewerReady(false);
    setViewerError(null);
    setUrlError(null);
    setNumPages(0);
    startPage.current = latest.current.page;
    setAttempt((a) => a + 1);
  }

  function goTo(n: number) {
    const target = Math.min(Math.max(1, Math.round(n)), Math.max(1, numPages));
    setPage(target);
    send({ t: "goto", page: target });
  }

  // -------------------------------------------------------------- states
  if (!project || ownership.loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator />
      </View>
    );
  }

  if (!hasAccess) {
    return (
      <BookLockedView
        title={project.title}
        thumbnailUrl={project.thumbnail_url}
        price={getEffectivePrice(project)}
        onBuy={async () => {
          await purchaseProject.mutateAsync(project.id);
        }}
        buying={purchaseProject.isPending}
      />
    );
  }

  const failure = urlError ?? viewerError;
  if (failure) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-canvas px-6" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <Text className="text-center text-ink">{failure}</Text>
        <View className="flex-row gap-3">
          <Button size="sm" variant="secondary" onPress={back}>
            Back
          </Button>
          <Button size="sm" onPress={retry}>
            Try again
          </Button>
        </View>
      </View>
    );
  }

  const loading = !url || numPages === 0;
  const multiPage = numPages > 1;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={theme.dark ? "light" : "dark"} />

      {/* Page area: kept clear of the system bars so a fitted page never slides under them. */}
      <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <WebView
          key={attempt}
          ref={webRef}
          source={{ html, baseUrl: PDF_VIEWER_BASE_URL }}
          originWhitelist={["about:*", "data:*", "https://*"]}
          onShouldStartLoadWithRequest={(req) =>
            req.url === PDF_VIEWER_BASE_URL || req.url.startsWith("about:") || req.url.startsWith("data:")
          }
          onMessage={onMessage}
          onError={() => setViewerError("The reader couldn't load. Check your connection and try again.")}
          onRenderProcessGone={retry}
          onContentProcessDidTerminate={retry}
          javaScriptEnabled
          domStorageEnabled={false}
          allowFileAccess={false}
          allowsLinkPreview={false}
          setSupportMultipleWindows={false}
          mixedContentMode="never"
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setBuiltInZoomControls={false}
          setDisplayZoomControls={false}
          textZoom={100}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1, backgroundColor: theme.bg }}
          containerStyle={{ backgroundColor: theme.bg }}
          accessibilityLabel={`${project.title}, page ${page} of ${numPages || "…"}`}
        />
        {loading ? (
          <View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: 10 }}>
            <ActivityIndicator color={theme.muted} />
            <Text style={{ color: theme.muted, fontSize: 13 }}>Opening book…</Text>
          </View>
        ) : null}
      </View>

      {chrome ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(140)}
          style={{ position: "absolute", top: 0, left: 0, right: 0, backgroundColor: theme.chrome, paddingTop: insets.top + 6, paddingBottom: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} style={{ padding: 6 }}>
            <Icon as={ChevronLeft} size={24} color={theme.ink} />
          </Pressable>
          <Text numberOfLines={1} style={{ flex: 1, color: theme.ink, fontSize: 15, fontWeight: "600" }}>
            {project.title}
          </Text>
        </Animated.View>
      ) : null}

      {chrome && !loading ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(140)}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: theme.chrome, paddingBottom: insets.bottom + 8, paddingTop: 8, paddingHorizontal: 16 }}
        >
          {multiPage ? (
            <Slider
              minimumValue={1}
              maximumValue={numPages}
              step={1}
              value={page}
              onSlidingComplete={goTo}
              minimumTrackTintColor={theme.accent}
              maximumTrackTintColor={theme.rule}
              thumbTintColor={theme.accent}
              accessibilityLabel="Page"
            />
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
            <Text style={{ color: theme.muted, fontSize: 13 }}>{multiPage ? `Page ${page} of ${numPages}` : "1 page"}</Text>
            <Pressable onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel="Themes and brightness" hitSlop={12} style={{ padding: 6 }}>
              <Icon as={SlidersHorizontal} size={20} color={theme.ink} />
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {sheet ? (
        <Sheet theme={theme} title="Themes & Brightness" onClose={() => setSheet(false)}>
          <View style={{ gap: 20, paddingHorizontal: 20, paddingBottom: 12 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {THEME_ORDER.map((id) => {
                const t = READER_THEMES[id];
                const active = id === themeId;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setThemeId(id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${t.label} theme`}
                    style={{ width: "30%", alignItems: "center", paddingVertical: 14, borderRadius: 16, backgroundColor: t.bg, borderWidth: 2, borderColor: active ? theme.accent : theme.rule }}
                  >
                    <Text style={{ color: t.ink, fontSize: 18, fontWeight: "600" }}>Aa</Text>
                    <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View>
              <Text style={{ color: theme.muted, fontSize: 13, marginBottom: 6 }}>Brightness</Text>
              <Slider
                minimumValue={40}
                maximumValue={100}
                step={5}
                value={brightness}
                onValueChange={setBrightness}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor={theme.rule}
                thumbTintColor={theme.accent}
                accessibilityLabel="Brightness"
              />
            </View>
          </View>
        </Sheet>
      ) : null}

      {resumeOffer ? (
        <ResumePrompt
          kind="book"
          where={`page ${resumeOffer.page} of ${numPages}`}
          percent={(resumeOffer.page / numPages) * 100}
          onContinue={() => {
            goTo(resumeOffer.page);
            setResumeOffer(null);
            setResumeApplied(true);
          }}
          onStartOver={() => {
            goTo(1);
            setResumeOffer(null);
            setResumeApplied(true);
          }}
        />
      ) : null}
    </View>
  );
}
