// src/components/project-types/EventFields.tsx
import { Pressable, View } from "react-native";

import { DateTimeFormField } from "@/components/ui/DateTimeFormField";
import { FormField } from "@/components/ui/FormField";
import { Image } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import { useUploadProjectThumbnail } from "@/hooks/useUploadProjectThumbnail";
import { pickSingleImage } from "@/lib/pickImage";
import { useState } from "react";

export interface EventFieldsValue {
  event_date: string; // "YYYY-MM-DDTHH:mm" local, "" = TBA
  location_type: "physical" | "online";
  location_value: string;
  ticket_template_url: string; // "" = none, use default ticket layout
}

export const EMPTY_EVENT_FIELDS: EventFieldsValue = { event_date: "", location_type: "physical", location_value: "", ticket_template_url: "" };

export function EventFields({ value, onChange }: { value: EventFieldsValue; onChange: (value: EventFieldsValue) => void }) {
  const uploadThumbnail = useUploadProjectThumbnail();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const set = <K extends keyof EventFieldsValue>(key: K, val: EventFieldsValue[K]) => onChange({ ...value, [key]: val });

  async function handleTicketTemplate() {
    setUploadError(null);
    try {
      const file = await pickSingleImage();
      if (!file) return;
      const uploaded = await uploadThumbnail.mutateAsync(file);
      set("ticket_template_url", uploaded.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <View>
      <DateTimeFormField label="Date & time (leave blank if TBA)" value={value.event_date} onChange={(v) => set("event_date", v)} clearable />

      <View className="mb-4">
        <Text className="mb-1.5 text-sm font-medium text-ink-muted">Where</Text>
        <View className="mb-2 flex-row gap-2">
          {(["physical", "online"] as const).map((type) => (
            <Pressable
              key={type}
              onPress={() => set("location_type", type)}
              accessibilityRole="radio"
              accessibilityState={{ selected: value.location_type === type }}
              className={`flex-1 items-center rounded-xl border py-2.5 ${value.location_type === type ? "border-accent bg-accent-soft" : "border-border"}`}
            >
              <Text className={`text-sm capitalize ${value.location_type === type ? "text-accent" : "text-ink-muted"}`}>{type}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FormField
        label={value.location_type === "physical" ? "Address" : "Join link"}
        placeholder={value.location_type === "physical" ? "123 Main St, Lagos" : "https://..."}
        value={value.location_value}
        onChangeText={(v) => set("location_value", v)}
        autoCapitalize={value.location_type === "physical" ? "sentences" : "none"}
        keyboardType={value.location_type === "physical" ? "default" : "url"}
      />

      <View className="mb-4">
        <Text className="mb-1.5 text-sm font-medium text-ink-muted">Ticket design (optional)</Text>
        <Text className="mb-2 text-xs text-ink-muted/70">
          Upload a background image and we'll overlay attendee details on it. Skip this and we'll use a clean default layout instead.
        </Text>
        {value.ticket_template_url ? (
          <View className="flex-row items-center gap-3">
            <Image source={{ uri: value.ticket_template_url }} contentFit="cover" accessibilityLabel="Ticket template" style={{ width: 80, height: 80, borderRadius: 8 }} />
            <Pressable onPress={() => set("ticket_template_url", "")} accessibilityRole="button">
              <Text className="text-sm text-danger">Remove</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => void handleTicketTemplate()}
            disabled={uploadThumbnail.isPending}
            accessibilityRole="button"
            className={`w-full items-center rounded-xl border border-dashed border-border px-4 py-3 ${uploadThumbnail.isPending ? "opacity-50" : ""}`}
          >
            <Text className="text-sm text-ink-muted">{uploadThumbnail.isPending ? "Uploading…" : "Choose image"}</Text>
          </Pressable>
        )}
        {uploadError ? <Text className="mt-1.5 text-sm text-danger">{uploadError}</Text> : null}
      </View>
    </View>
  );
}
