import { useEffect, useId, useState } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { Button } from "../../../../app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../app/components/ui/dialog";
import { Input } from "../../../../app/components/ui/input";
import { Label } from "../../../../app/components/ui/label";
import type { UserVocabularyList } from "../../../../lib/vocabularyLists";
import { LIST_NAME_MAX_LENGTH, validateListName } from "./listNameValidation";

interface RenameListDialogProps {
  // null closes the dialog; a list opens it prefilled with that list's
  // current name — mirrors CreateListDialog's open/onOpenChange shape but
  // keyed off "which list", since the dialog needs the list's current name
  // and id, not just a boolean.
  list: UserVocabularyList | null;
  isSubmitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void | Promise<void>;
}

// Small prefilled-name dialog — Cancel / Save. Same Radix Dialog primitives
// and validation (trim/empty/whitespace/80-char) as CreateListDialog; a
// duplicate rename surfaces the identical localized duplicate-name error
// via the shared `error` prop (MyListsSection resolves the category the
// same way for both create and rename).
export function RenameListDialog({ list, isSubmitting, error, onOpenChange, onSubmit }: RenameListDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const nameInputId = useId();
  const open = list !== null;

  // Re-seeds the draft whenever a (possibly different) list opens the
  // dialog, and clears it on close — reopening for a second list, or
  // reopening the same one after a cancel, never shows stale text.
  useEffect(() => {
    setName(list?.name ?? "");
  }, [list]);

  const validation = validateListName(name);
  // Unlike Create, a rename whose trimmed name exactly matches the list's
  // current name is still a no-op worth allowing through (case/whitespace
  // cleanup counts as a real change) — the RPC's own duplicate check
  // already excludes the list's own row, so this never needs to special-
  // case "unchanged" here.
  const canSubmit = validation.ok && !isSubmitting;

  const handleSubmit = () => {
    if (!validation.ok || isSubmitting) return;
    void onSubmit(validation.name);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("userProfile.myListsSection.renameModal.title")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("userProfile.myListsSection.renameModal.title")}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={nameInputId}>{t("userProfile.myListsSection.modal.fieldLabel")}</Label>
            <Input
              id={nameInputId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("userProfile.myListsSection.modal.placeholder")}
              maxLength={LIST_NAME_MAX_LENGTH}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          {error ? (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              {t("userProfile.myListsSection.modal.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {t("userProfile.myListsSection.renameModal.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
