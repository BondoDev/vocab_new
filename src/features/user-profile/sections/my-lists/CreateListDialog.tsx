import { useEffect, useId, useState } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { Button } from "../../../../app/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../../../app/components/ui/dialog";
import { Input } from "../../../../app/components/ui/input";
import { Label } from "../../../../app/components/ui/label";
import { LIST_NAME_MAX_LENGTH, validateListName } from "./listNameValidation";

interface CreateListDialogProps {
  open: boolean;
  isSubmitting: boolean;
  // A safe, already-localized message for a failed create call (network/
  // server error) — never a raw Supabase/PostgREST error. null when there
  // is nothing to show (dialog just opened, or the previous attempt
  // succeeded).
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void | Promise<void>;
}

// The Create List dialog itself: one required name field, Cancel, Create
// List — the "Keep V1 simple" shape from the My Lists Phase 1 brief. Uses
// the project's existing Radix-based Dialog primitives (matching
// AccountLanguageConfirmDialog's precedent) so focus trapping, an
// accessible title, and focus-return-to-trigger on close all come from the
// shared primitive rather than being reimplemented here.
export function CreateListDialog({ open, isSubmitting, error, onOpenChange, onSubmit }: CreateListDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const nameInputId = useId();

  // Resets the draft name whenever the dialog transitions to closed, so
  // reopening it (to create a second list) never shows the previous list's
  // leftover text.
  useEffect(() => {
    if (!open) {
      setName("");
    }
  }, [open]);

  const validation = validateListName(name);
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
          <DialogTitle>{t("userProfile.myListsSection.modal.title")}</DialogTitle>
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
              {t("userProfile.myListsSection.modal.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
