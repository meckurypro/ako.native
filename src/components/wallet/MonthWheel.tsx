// src/components/wallet/MonthWheel.tsx
//
// Month + year scroll wheels (the picker in the Transactions "Month" and "Time Frame" sheets). Plain ScrollView
// with snapToInterval — no native module. Future months can't be picked: scrolling past the current month glides
// back to it. Mirrors the web wheel.
import { useEffect, useRef } from "react";
import { Platform, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import { Text } from "@/components/ui";
import { clampToNow, ymOf, type YearMonth } from "@/lib/walletRange";

const ITEM = 40; // px per row; the wheel shows five rows, the middle one is the selection
const HEIGHT = ITEM * 5;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS_BACK = 3;

function Wheel({
  items,
  index,
  maxIndex,
  onChange,
  label,
}: {
  items: string[];
  index: number;
  maxIndex: number;
  onChange: (index: number) => void;
  label: string;
}) {
  const ref = useRef<ScrollView>(null);
  const reported = useRef(index);
  const placed = useRef(false);

  // Put the wheel on the selected row once its content has been laid out (scrolling before that is ignored)…
  const placeInitially = () => {
    if (placed.current) return;
    placed.current = true;
    ref.current?.scrollTo({ y: index * ITEM, animated: false });
  };

  // …and follow the parent when it changes the value (a preset, a clamp).
  useEffect(() => {
    if (index !== reported.current) {
      reported.current = index;
      ref.current?.scrollTo({ y: index * ITEM, animated: true });
    }
  }, [index]);

  function settle(y: number) {
    let next = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM)));
    if (next > maxIndex) {
      next = maxIndex;
      ref.current?.scrollTo({ y: next * ITEM, animated: true });
    }
    reported.current = next;
    if (next !== index) onChange(next);
  }

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => settle(e.nativeEvent.contentOffset.y);
  // iOS: a slow drag released without momentum doesn't fire the momentum event, so settle here when nothing is
  // flinging. (`velocity` only exists on iOS; Android always reports momentum end after a snap.)
  const onDragEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS === "ios" && Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle(e.nativeEvent.contentOffset.y);
  };

  return (
    <View style={{ height: HEIGHT }} accessibilityLabel={label}>
      <View pointerEvents="none" className="absolute inset-x-1 rounded-xl bg-accent-soft" style={{ top: ITEM * 2, height: ITEM }} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        nestedScrollEnabled
        contentOffset={{ x: 0, y: index * ITEM }}
        onContentSizeChange={placeInitially}
        onMomentumScrollEnd={onMomentumEnd}
        onScrollEndDrag={onDragEnd}
        contentContainerStyle={{ paddingVertical: ITEM * 2 }}
      >
        {items.map((text, i) => (
          <Pressable
            key={text}
            onPress={() => {
              const target = Math.min(i, maxIndex);
              ref.current?.scrollTo({ y: target * ITEM, animated: true });
              reported.current = target;
              if (target !== index) onChange(target);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: i === index, disabled: i > maxIndex }}
            style={{ height: ITEM }}
            className="items-center justify-center"
          >
            <Text
              className={`text-lg ${i === index ? "font-semibold text-ink" : i > maxIndex ? "text-ink-muted/30" : "text-ink-muted"}`}
            >
              {text}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function MonthYearPicker({ value, onChange }: { value: YearMonth; onChange: (value: YearMonth) => void }) {
  const now = ymOf();
  const years = Array.from({ length: YEARS_BACK + 1 }, (_, i) => now.year - YEARS_BACK + i);
  const yearIndex = Math.max(0, years.indexOf(value.year));
  const monthMax = value.year >= now.year ? now.month : 11;
  const safe = clampToNow(value);

  return (
    <View className="flex-row gap-2">
      <View className="flex-1">
        <Wheel
          label="Month"
          items={MONTHS}
          index={safe.month}
          maxIndex={monthMax}
          onChange={(m) => onChange(clampToNow({ year: value.year, month: m }))}
        />
      </View>
      <View className="flex-1">
        <Wheel
          label="Year"
          items={years.map(String)}
          index={yearIndex}
          maxIndex={years.length - 1}
          onChange={(i) => onChange(clampToNow({ year: years[i], month: value.month }))}
        />
      </View>
    </View>
  );
}
