// src/screens/EventCheckIn.tsx
// Host-only door tool: scan a ticket's QR with the camera (or type the code),
// see whether it's valid / already used, and check the guest in.
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useLocalSearchParams } from "expo-router";
import { Camera, CheckCircle2, Keyboard as KeyboardIcon, Users, XCircle } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { useCheckInTicket, useEventTicketHolders, useTicketByCode } from "@/hooks/useEventTickets";
import { useProject } from "@/hooks/useProjects";
import { haptics } from "@/lib/haptics";
import { MONO_FONT } from "@/theme/mono";
import { useTheme } from "@/theme/ThemeProvider";

export function EventCheckIn() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { data: project } = useProject(projectId);
  const isOwner = !!user && project?.owner_id === user.id;

  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [manualCode, setManualCode] = useState("");
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  // The scanner fires many times a second for the same code; take the first hit only.
  const lockedRef = useRef(false);

  const ticketQuery = useTicketByCode(projectId, scannedCode);
  const checkIn = useCheckInTicket(projectId ?? "");
  const holdersQuery = useEventTicketHolders(projectId);
  const checkedInCount = (holdersQuery.data ?? []).filter((t) => t.checked_in_at).length;
  const totalCount = holdersQuery.data?.length ?? 0;

  const onScanned = useCallback((result: BarcodeScanningResult) => {
    if (lockedRef.current || !result.data) return;
    lockedRef.current = true;
    haptics.medium();
    setScannedCode(result.data);
  }, []);

  function handleManualSubmit() {
    const code = manualCode.trim();
    if (!code) return;
    lockedRef.current = true;
    setScannedCode(code.toUpperCase());
  }

  function reset() {
    lockedRef.current = false;
    setScannedCode(null);
    setManualCode("");
  }

  if (!project) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  if (!isOwner) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-4">
        <Text className="text-center text-ink-muted">Only the event host can scan tickets here.</Text>
      </View>
    );
  }

  const ticket = ticketQuery.data;
  const showCamera = !scannedCode && mode === "camera";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-canvas">
      <ScreenHeader title="Scan tickets" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text className="mb-1 text-sm text-ink-muted">{project.title}</Text>
        <View className="mb-4 flex-row items-center gap-1.5">
          <Icon as={Users} size={14} className="text-ink-muted" />
          <Text className="text-sm text-ink-muted">
            {checkedInCount}/{totalCount} checked in
          </Text>
        </View>

        {!scannedCode && (
          <View className="mb-3 flex-row gap-2">
            {(
              [
                { key: "camera", label: "Camera", icon: Camera },
                { key: "manual", label: "Enter code", icon: KeyboardIcon },
              ] as const
            ).map(({ key, label, icon }) => {
              const active = mode === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setMode(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border py-2.5 ${active ? "border-accent bg-accent" : "border-border bg-surface"}`}
                >
                  <Icon as={icon} size={14} className={active ? "text-canvas" : "text-ink-muted"} />
                  <Text className={`text-sm font-medium ${active ? "text-canvas" : "text-ink-muted"}`}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {showCamera &&
          (!permission ? (
            <View className="aspect-square items-center justify-center rounded-xl border border-border bg-surface">
              <Text className="text-sm text-ink-muted">Starting camera…</Text>
            </View>
          ) : !permission.granted ? (
            <View className="items-center gap-3 rounded-xl border border-border bg-surface p-6">
              <Icon as={Camera} size={24} className="text-ink-muted" />
              <Text className="text-center text-sm text-ink-muted">Akọ needs camera access to scan ticket QR codes. You can also enter codes by hand.</Text>
              <Pressable
                onPress={async () => {
                  if (permission.canAskAgain) {
                    const res = await requestPermission();
                    if (!res.granted) toast("Camera permission denied.", { variant: "error" });
                  } else {
                    void Linking.openSettings();
                  }
                }}
                accessibilityRole="button"
                className="rounded-full bg-accent px-4 py-2"
              >
                <Text className="text-sm font-medium text-canvas">{permission.canAskAgain ? "Allow camera" : "Open settings"}</Text>
              </Pressable>
            </View>
          ) : (
            <View className="aspect-square overflow-hidden rounded-xl border border-border bg-canvas">
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={onScanned}
                onMountError={() => toast("Couldn't start the camera — use manual entry.", { variant: "error" })}
              />
            </View>
          ))}

        {!scannedCode && mode === "manual" && (
          <View className="flex-row gap-2">
            <TextInput
              value={manualCode}
              onChangeText={setManualCode}
              onSubmitEditing={handleManualSubmit}
              placeholder="Ticket code"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              className="flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink"
              style={{ fontFamily: MONO_FONT }}
              accessibilityLabel="Ticket code"
            />
            <Pressable onPress={handleManualSubmit} disabled={!manualCode.trim()} accessibilityRole="button" className={`justify-center rounded-full bg-accent px-4 py-2.5 ${manualCode.trim() ? "" : "opacity-50"}`}>
              <Text className="text-sm font-medium text-canvas">Look up</Text>
            </Pressable>
          </View>
        )}

        {scannedCode && (
          <View className="rounded-xl border border-border bg-surface p-4">
            {ticketQuery.isLoading ? (
              <Text className="text-sm text-ink-muted">Looking up…</Text>
            ) : ticket ? (
              <>
                <Text selectable className="mb-1 text-sm text-ink" style={{ fontFamily: MONO_FONT }}>
                  {ticket.ticket_code}
                </Text>
                <Text className="mb-3 text-sm text-ink-muted">{ticket.recipient_email}</Text>
                {ticket.checked_in_at ? (
                  <View className="mb-3 flex-row items-center gap-1.5">
                    <Icon as={XCircle} size={16} className="text-danger" />
                    <Text className="text-sm font-medium text-danger">Already checked in {new Date(ticket.checked_in_at).toLocaleTimeString()}</Text>
                  </View>
                ) : (
                  <View className="mb-3 flex-row items-center gap-1.5">
                    <Icon as={CheckCircle2} size={16} className="text-accent" />
                    <Text className="text-sm font-medium text-accent">Valid — not yet checked in</Text>
                  </View>
                )}
                <View className="flex-row items-center gap-3">
                  {!ticket.checked_in_at && (
                    <Pressable
                      onPress={() =>
                        checkIn.mutate(ticket.id, {
                          onSuccess: () => haptics.success(),
                          onError: (e) => toast(e instanceof Error && e.message ? e.message : "Couldn't check in.", { variant: "error" }),
                        })
                      }
                      disabled={checkIn.isPending}
                      accessibilityRole="button"
                      className={`rounded-full bg-accent px-4 py-2 ${checkIn.isPending ? "opacity-50" : ""}`}
                    >
                      <Text className="text-sm font-medium text-canvas">{checkIn.isPending ? "Checking in…" : "Check in"}</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={reset} accessibilityRole="button" hitSlop={8}>
                    <Text className="text-sm font-medium text-ink-muted">Scan next</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View className="mb-3 flex-row items-center gap-1.5">
                  <Icon as={XCircle} size={16} className="text-danger" />
                  <Text className="text-sm font-medium text-danger">No ticket found for this code</Text>
                </View>
                <Pressable onPress={reset} accessibilityRole="button" hitSlop={8} className="self-start">
                  <Text className="text-sm font-medium text-accent">Try again</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
