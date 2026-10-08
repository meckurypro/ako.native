// src/screens/TicketView.tsx
// The buyer's event ticket: issued image if the backend made one, otherwise a
// QR + code card. Shows check-in status; the image can be saved/shared.
import { File, Paths } from "expo-file-system";
import { useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import { CheckCircle2, Clock, Download } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FeedDoorway } from "@/components/project/FeedDoorway";
import { QrCode } from "@/components/ui/QrCode";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon, Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useMyEventTicket } from "@/hooks/useEventTickets";
import { useFeedDoorway } from "@/hooks/useFeedDoorway";
import { useProject } from "@/hooks/useProjects";
import { useEventDetails } from "@/hooks/useProjectTypeDetails";
import { MONO_FONT } from "@/theme/mono";

function imageExtension(url: string): string {
  const match = url.split("?")[0].match(/\.(png|jpe?g|webp)$/i);
  return match ? match[1].toLowerCase() : "png";
}

export function TicketView() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data: project } = useProject(projectId);
  const { data: eventDetails } = useEventDetails(projectId);
  const { data: ticket, isLoading } = useMyEventTicket(projectId);
  const ticketDoorway = useFeedDoorway("ticket");
  const [saving, setSaving] = useState(false);
  const [imageRatio, setImageRatio] = useState<number | null>(null);

  async function saveImage(url: string) {
    setSaving(true);
    try {
      const target = new File(Paths.cache, `ako-ticket-${ticket?.ticket_code ?? "ticket"}.${imageExtension(url)}`);
      if (target.exists) target.delete();
      const downloaded = await File.downloadFileAsync(url, target);
      if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
      await Sharing.shareAsync(downloaded.uri, { dialogTitle: "Save ticket" });
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "Couldn't save the ticket.", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (!project) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-ink-muted">Loading…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader title={project.title} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {eventDetails?.event_date && (
          <Text className="mb-6 text-sm text-ink-muted">
            {new Date(eventDetails.event_date).toLocaleString()} — {eventDetails.location_type === "physical" ? eventDetails.location_value : "Online"}
          </Text>
        )}

        {isLoading ? (
          <Text className="text-sm text-ink-muted">Loading your ticket…</Text>
        ) : ticket ? (
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {ticket.ticket_image_url ? (
              <Image
                source={ticket.ticket_image_url}
                contentFit="contain"
                accessibilityLabel="Your ticket"
                className="w-full"
                style={{ aspectRatio: imageRatio ?? 1 }}
                onLoad={(e) => e.source.width && e.source.height && setImageRatio(e.source.width / e.source.height)}
              />
            ) : (
              <View className="items-center gap-3 p-6">
                <Text className="text-center font-medium text-ink">{project.title}</Text>
                <QrCode value={ticket.ticket_code} size={160} />
                <View className="items-center">
                  <Text className="text-xs text-ink-muted">Ticket code</Text>
                  <Text selectable className="text-sm tracking-wide text-ink" style={{ fontFamily: MONO_FONT }}>
                    {ticket.ticket_code}
                  </Text>
                </View>
                {ticket.checked_in_at && (
                  <View className="flex-row items-center gap-1.5">
                    <Icon as={CheckCircle2} size={13} className="text-accent" />
                    <Text className="text-xs font-medium text-accent">Checked in {new Date(ticket.checked_in_at).toLocaleString()}</Text>
                  </View>
                )}
              </View>
            )}
            <View className="flex-row items-center justify-between gap-3 p-4">
              <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-ink-muted">
                Sent to {ticket.recipient_email}
              </Text>
              {ticket.ticket_image_url && (
                <Pressable onPress={() => saveImage(ticket.ticket_image_url!)} disabled={saving} accessibilityRole="button" className={`flex-row items-center gap-1.5 ${saving ? "opacity-50" : ""}`}>
                  {saving ? <ActivityIndicator size="small" /> : <Icon as={Download} size={14} className="text-accent" />}
                  <Text className="text-sm font-medium text-accent">Download</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          <View className="mt-10 items-center gap-2">
            <Icon as={Clock} size={24} className="text-ink-muted" />
            <Text className="text-center text-sm text-ink-muted">If you've just bought this, your ticket is still being issued — check back shortly.</Text>
          </View>
        )}
        {ticket && ticketDoorway.visible && <FeedDoorway context="ticket" onEnter={ticketDoorway.markEnteredFeed} />}
      </ScrollView>
    </View>
  );
}
