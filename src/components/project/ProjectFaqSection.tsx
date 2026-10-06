// src/components/project/ProjectFaqSection.tsx
// FAQ on a project page: an accordion for visitors; inline add / edit / delete
// (and starter questions) for the owner.
import { Check, ChevronDown, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

import { Icon } from "@/components/ui/styled";
import { Text } from "@/components/ui/Text";
import {
  projectTypeSupportsFaq,
  useAddProjectFaq,
  useDeleteProjectFaq,
  useProjectFaqs,
  useScaffoldProjectFaqs,
  useUpdateProjectFaq,
  type ProjectFaq,
} from "@/hooks/useProjectFaqs";
import { useTheme } from "@/theme/ThemeProvider";

function FaqAccordionItem({ faq }: { faq: ProjectFaq }) {
  const [open, setOpen] = useState(false);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? "180deg" : "0deg", { duration: 200 }) }] }));
  return (
    <View className="overflow-hidden rounded-xl border border-border">
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} className="flex-row items-center justify-between gap-3 px-4 py-3">
        <Text className="flex-1 text-sm font-medium text-ink">{faq.question}</Text>
        <Animated.View style={chevron}>
          <Icon as={ChevronDown} size={16} className="text-ink-muted" />
        </Animated.View>
      </Pressable>
      {open ? <Text className="px-4 pb-3.5 text-sm text-ink-muted">{faq.answer}</Text> : null}
    </View>
  );
}

function FaqFields({
  question,
  answer,
  onQuestion,
  onAnswer,
  autoFocus,
}: {
  question: string;
  answer: string;
  onQuestion: (v: string) => void;
  onAnswer: (v: string) => void;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const common = { placeholderTextColor: colors.inkMuted, selectionColor: colors.accent, cursorColor: colors.accent };
  return (
    <View className="gap-2">
      <TextInput
        value={question}
        onChangeText={(v) => onQuestion(v.slice(0, 200))}
        placeholder="Question"
        autoFocus={autoFocus}
        className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm font-medium text-ink"
        style={{ fontFamily: "Inter_500Medium" }}
        {...common}
      />
      <TextInput
        value={answer}
        onChangeText={(v) => onAnswer(v.slice(0, 1000))}
        placeholder="Answer"
        multiline
        textAlignVertical="top"
        className="rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-ink"
        style={{ fontFamily: "Inter_400Regular", minHeight: 72 }}
        {...common}
      />
    </View>
  );
}

function FaqEditRow({ faq, onSave, onDelete, saving, deleting }: { faq: ProjectFaq; onSave: (q: string, a: string) => void; onDelete: () => void; saving: boolean; deleting: boolean }) {
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);

  if (!editing) {
    return (
      <View className="rounded-xl border border-border p-3.5">
        <View className="flex-row items-start justify-between gap-2">
          <Text className="flex-1 text-sm font-medium text-ink">{faq.question}</Text>
          <View className="shrink-0 flex-row items-center gap-1">
            <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="Edit" hitSlop={8} className="p-1">
              <Icon as={Pencil} size={14} className="text-ink-muted" />
            </Pressable>
            <Pressable onPress={onDelete} disabled={deleting} accessibilityRole="button" accessibilityLabel="Delete" hitSlop={8} className="p-1">
              {deleting ? <ActivityIndicator size="small" /> : <Icon as={Trash2} size={14} className="text-danger" />}
            </Pressable>
          </View>
        </View>
        <Text className="mt-1 text-sm text-ink-muted">{faq.answer}</Text>
      </View>
    );
  }

  return (
    <View className="gap-2 rounded-xl border border-accent p-3.5">
      <FaqFields question={question} answer={answer} onQuestion={setQuestion} onAnswer={setAnswer} />
      <View className="flex-row justify-end gap-2">
        <Pressable
          onPress={() => {
            setQuestion(faq.question);
            setAnswer(faq.answer);
            setEditing(false);
          }}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          hitSlop={8}
          className="p-1.5"
        >
          <Icon as={X} size={16} className="text-ink-muted" />
        </Pressable>
        <Pressable
          onPress={() => {
            if (!question.trim() || !answer.trim()) return;
            onSave(question, answer);
            setEditing(false);
          }}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save"
          hitSlop={8}
          className="p-1.5"
        >
          {saving ? <ActivityIndicator size="small" /> : <Icon as={Check} size={16} className="text-accent" />}
        </Pressable>
      </View>
    </View>
  );
}

export function ProjectFaqSection({ projectId, projectType, isOwner }: { projectId: string; projectType: string; isOwner: boolean }) {
  const { data: faqs } = useProjectFaqs(projectId);
  const scaffold = useScaffoldProjectFaqs(projectId);
  const addFaq = useAddProjectFaq(projectId);
  const updateFaq = useUpdateProjectFaq(projectId);
  const deleteFaq = useDeleteProjectFaq(projectId);

  const [adding, setAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const eligible = projectTypeSupportsFaq(projectType);
  if (!eligible && (!faqs || faqs.length === 0)) return null;

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteFaq.mutateAsync(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <View className="mt-6">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="font-display text-base text-ink">FAQ</Text>
        {isOwner && eligible ? (
          <View className="flex-row items-center gap-4">
            {(faqs?.length ?? 0) === 0 ? (
              <Pressable onPress={() => scaffold.mutate()} disabled={scaffold.isPending} accessibilityRole="button" className={`flex-row items-center gap-1 ${scaffold.isPending ? "opacity-50" : ""}`}>
                {scaffold.isPending ? <ActivityIndicator size="small" /> : <Icon as={Sparkles} size={14} className="text-accent" />}
                <Text className="text-sm font-medium text-accent">Use starter questions</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setAdding(true)} accessibilityRole="button" className="flex-row items-center gap-1">
              <Icon as={Plus} size={14} className="text-accent" />
              <Text className="text-sm font-medium text-accent">Add</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {!faqs || faqs.length === 0 ? (
        isOwner ? <Text className="text-sm text-ink-muted">No FAQ yet — add your own, or use the starter questions above to get going quickly.</Text> : null
      ) : (
        <View className="gap-2">
          {faqs.map((faq) =>
            isOwner ? (
              <FaqEditRow
                key={faq.id}
                faq={faq}
                onSave={(question, answer) => updateFaq.mutate({ id: faq.id, question, answer })}
                onDelete={() => void handleDelete(faq.id)}
                saving={updateFaq.isPending}
                deleting={deletingId === faq.id}
              />
            ) : (
              <FaqAccordionItem key={faq.id} faq={faq} />
            )
          )}
        </View>
      )}

      {isOwner && adding ? (
        <View className="mt-2 gap-2 rounded-xl border border-accent p-3.5">
          <FaqFields question={newQuestion} answer={newAnswer} onQuestion={setNewQuestion} onAnswer={setNewAnswer} autoFocus />
          <View className="flex-row justify-end gap-2">
            <Pressable
              onPress={() => {
                setAdding(false);
                setNewQuestion("");
                setNewAnswer("");
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              hitSlop={8}
              className="p-1.5"
            >
              <Icon as={X} size={16} className="text-ink-muted" />
            </Pressable>
            <Pressable
              onPress={async () => {
                if (!newQuestion.trim() || !newAnswer.trim()) return;
                await addFaq.mutateAsync({ question: newQuestion, answer: newAnswer });
                setAdding(false);
                setNewQuestion("");
                setNewAnswer("");
              }}
              disabled={addFaq.isPending}
              accessibilityRole="button"
              accessibilityLabel="Save"
              hitSlop={8}
              className="p-1.5"
            >
              {addFaq.isPending ? <ActivityIndicator size="small" /> : <Icon as={Check} size={16} className="text-accent" />}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
