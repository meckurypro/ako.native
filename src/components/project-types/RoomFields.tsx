// src/components/project-types/RoomFields.tsx
import { DateTimeFormField } from "@/components/ui/DateTimeFormField";
import { InfoNote } from "@/components/ui/InfoNote";

export interface RoomFieldsValue {
  start_date: string; // "YYYY-MM-DDTHH:mm" local, optional
  end_date: string;
}

export const EMPTY_ROOM_FIELDS: RoomFieldsValue = { start_date: "", end_date: "" };

export function RoomFields({ value, onChange, error }: { value: RoomFieldsValue; onChange: (value: RoomFieldsValue) => void; error?: string }) {
  return (
    <>
      <DateTimeFormField label="Start date (optional)" value={value.start_date} onChange={(start_date) => onChange({ ...value, start_date })} clearable />
      <DateTimeFormField label="End date (optional)" value={value.end_date} onChange={(end_date) => onChange({ ...value, end_date })} error={error} clearable />

      <InfoNote>
        Members see a countdown once a start date is set. After the end date, the cohort closes — only media you've posted stays visible to people who were in it. You'll
        set up lectures, meetings, and assignments after creating it, from its manage screen.
      </InfoNote>
    </>
  );
}
