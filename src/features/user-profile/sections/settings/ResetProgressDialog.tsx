import { useEffect, useId, useState } from "react";
import { useLanguage, type UILanguage } from "../../../../contexts/LanguageContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../../app/components/ui/alert-dialog";
import { Input } from "../../../../app/components/ui/input";
import { Label } from "../../../../app/components/ui/label";
import { isResetConfirmationValid, RESET_CONFIRMATION_WORD } from "../../../../app/utils/settingsConfirmation";

interface ResetProgressDialogProps {
  // null closes the dialog; a language code opens it targeting that
  // language - mirrors DeleteListDialog's "list: X | null" shape.
  targetLanguage: UILanguage | null;
  isResetting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

// Strong confirmation for the single most destructive non-account action in
// Settings: the user must type the literal word "RESET" before the final
// button becomes enabled (see settingsConfirmation.ts's header for why a
// fixed word, not the translated language name). AlertDialog (not the plain
// Dialog CreateListDialog/RenameListDialog use) matches DeleteListDialog's
// own precedent for a destructive confirmation.
export function ResetProgressDialog({
  targetLanguage,
  isResetting,
  error,
  onOpenChange,
  onConfirm,
}: ResetProgressDialogProps) {
  const { t } = useLanguage();
  const [confirmationText, setConfirmationText] = useState("");
  const confirmationInputId = useId();
  const open = targetLanguage !== null;

  // Clears the typed confirmation whenever the dialog closes (cancel,
  // successful reset, or backdrop dismiss) so a stray leftover "RESET" can
  // never pre-enable the button the next time this dialog opens.
  useEffect(() => {
    if (!open) {
      setConfirmationText("");
    }
  }, [open]);

  const languageName = targetLanguage ? t(`languageNames.${targetLanguage}`) : "";
  const canConfirm = isResetConfirmationValid(confirmationText) && !isResetting;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isResetting) onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent className="settings-danger-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("userProfile.settingsSection.dataAccount.resetDialog.title").replace("{language}", languageName)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("userProfile.settingsSection.dataAccount.resetDialog.description").replace(
              "{language}",
              languageName,
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="settings-danger-dialog__confirm-field">
          <Label htmlFor={confirmationInputId}>
            {t("userProfile.settingsSection.dataAccount.resetDialog.confirmLabel").replace(
              "{word}",
              RESET_CONFIRMATION_WORD,
            )}
          </Label>
          <Input
            id={confirmationInputId}
            value={confirmationText}
            onChange={(event) => setConfirmationText(event.target.value)}
            placeholder={RESET_CONFIRMATION_WORD}
            disabled={isResetting}
            autoComplete="off"
            autoFocus
          />
        </div>

        {error ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResetting}>
            {t("userProfile.settingsSection.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={(event) => {
              // Kept open (and disabled) for the duration of the reset call —
              // the parent closes it once the RPC resolves, matching
              // DeleteListDialog's own isDeleting-gated close behavior.
              event.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60"
          >
            {t("userProfile.settingsSection.dataAccount.resetDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
