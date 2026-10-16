// src/hooks/useBookDraft.ts
// Local working copy of a book's chapters for the builder. Add / edit / move /
// delete are staged here (with undo + redo across all of them); nothing is written
// until save() — so leaving the page without saving leaves the stored book untouched.
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { isTempChapterId, useSaveBookDraft, type BookChapter, type BookChapterKind } from "./useBookBuilder";
import { useUndoRedo } from "./useUndoRedo";

let tempCounter = 0;

export function useBookDraft(projectId: string, server: BookChapter[]) {
  const queryClient = useQueryClient();
  const history = useUndoRedo<BookChapter[]>(server);
  const saveMutation = useSaveBookDraft(projectId);

  // Follow the stored book until the creator has staged something.
  const serverSig = JSON.stringify(server);
  const dirtyRef = useRef(false);
  dirtyRef.current = history.isDirty;
  const { reset } = history;
  useEffect(() => {
    if (!dirtyRef.current) reset(server);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSig, reset]);

  const chapters = history.value;

  function edit(id: string, patch: { title?: string; content?: string }) {
    history.set((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function move(id: string, direction: "up" | "down") {
    history.set(
      (list) => {
        const i = list.findIndex((c) => c.id === id);
        const j = direction === "up" ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= list.length) return list;
        const next = list.slice();
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      },
      { step: true },
    );
  }

  function remove(id: string) {
    history.set((list) => list.filter((c) => c.id !== id), { step: true });
  }

  function add(kind: BookChapterKind, title: string): BookChapter {
    const created: BookChapter = {
      id: `tmp-${Date.now()}-${tempCounter++}`,
      project_id: projectId,
      kind,
      title,
      content: "",
      sort_order: 0,
    };
    history.set((list) => [...list, created], { step: true });
    return created;
  }

  async function save() {
    const fresh = await saveMutation.mutateAsync({ original: server, draft: history.value });
    queryClient.setQueryData(["book-chapters", projectId], fresh);
    history.reset(fresh);
    return fresh;
  }

  function discard() {
    history.reset(server);
  }

  return {
    chapters,
    edit,
    move,
    remove,
    add,
    save,
    discard,
    saving: saveMutation.isPending,
    undo: history.undo,
    redo: history.redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    isDirty: history.isDirty,
    isNew: (id: string) => isTempChapterId(id),
  };
}
