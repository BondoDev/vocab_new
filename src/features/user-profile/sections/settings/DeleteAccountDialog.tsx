import { useEffect, useId, useState } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
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
import { DELETE_CONFIRMATION_WORD, isDeleteConfirmationValid } from "../../../../app/utils/settingsConfirmation";

interface DeleteAccountDialogProps {
  open: boolean;
  isDeleting: boolean;
  error: string | null;
  // True for a password-provider account — see accountDeletion.ts's
  // isPasswordAccount. Only these accounts need an in-dialog password
  // reauthentication step; Google-OAuth accounts need none at all (see
  // this component's own header for why).
  requiresPassword: boolean;
  // Controlled by SettingsSection (not owned locally the way the DELETE
  // confirmation text below is) — handleConfirmDelete needs the actual
  // typed value to call reauthenticateForAccountDeletion, not just a
  // validity boolean.
  password: string;
  onPasswordChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

// The account's own strong confirmation — same typed-word pattern as
// ResetProgressDialog, one level more serious (this removes the account
// itself, not one language's progress) — plus, for password accounts, a
// genuine server-enforced reauthentication step: the current password is
// re-verified through Supabase Auth (reauthenticateForAccountDeletion,
// accountDeletion.ts) immediately before the delete call, and the
// delete-account Edge Function independently re-checks recency of
// authentication server-side (never trusts this dialog to have done it) —
// see that function's own header for the full design. Typed `DELETE` alone
// only guards against an accidental click; this reauthentication step is
// what guards against a stale/compromised session.
//
// Google-OAuth accounts have no password to re-verify here, and — per
// product policy (2026-08-14) — none is required: the Edge Function trusts
// a currently-valid, currently-Google-authenticated session outright (see
// recentAuth.ts's isCurrentSessionGoogleAuthenticated and index.ts's own
// header for the exact server-side signals and reasoning). So this dialog
// shows no password field and no reauthentication warning for them at
// all — just the typed-DELETE confirmation, same as any other confirm
// dialog. Clicking Delete calls the endpoint directly with the current
// session; if the backend accepts the session, deletion proceeds.
export function DeleteAccountDialog({
  open,
  isDeleting,
  error,
  requiresPassword,
  password,
  onPasswordChange,
  onOpenChange,
  onConfirm,
}: DeleteAccountDialogProps) {
  const { t } = useLanguage();
  const [confirmationText, setConfirmationText] = useState("");
  const confirmationInputId = useId();
  const passwordInputId = useId();

  useEffect(() => {
    if (!open) {
      setConfirmationText("");
    }
  }, [open]);

  const canConfirm =
    isDeleteConfirmationValid(confirmationText) &&
    (!requiresPassword || password.length > 0) &&
    !isDeleting;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isDeleting) onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent className="settings-danger-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("userProfile.settingsSection.dataAccount.deleteDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("userProfile.settingsSection.dataAccount.deleteDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="settings-danger-dialog__confirm-field">
          <Label htmlFor={confirmationInputId}>
            {t("userProfile.settingsSection.dataAccount.deleteDialog.confirmLabel").replace(
              "{word}",
              DELETE_CONFIRMATION_WORD,
            )}
          </Label>
          <Input
            id={confirmationInputId}
            value={confirmationText}
            onChange={(event) => setConfirmationText(event.target.value)}
            placeholder={DELETE_CONFIRMATION_WORD}
            disabled={isDeleting}
            autoComplete="off"
            autoFocus
          />
        </div>

        {requiresPassword ? (
          <div className="settings-danger-dialog__confirm-field">
            <Label htmlFor={passwordInputId}>
              {t("userProfile.settingsSection.dataAccount.deleteDialog.passwordLabel")}
            </Label>
            <Input
              id={passwordInputId}
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              disabled={isDeleting}
              autoComplete="current-password"
            />
            <p className="settings-surface__helper">
              {t("userProfile.settingsSection.dataAccount.deleteDialog.passwordHelper")}
            </p>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{t("userProfile.settingsSection.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60"
          >
            {requiresPassword
              ? t("userProfile.settingsSection.dataAccount.deleteDialog.verifyAndDeleteButton")
              : t("userProfile.settingsSection.dataAccount.deleteDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
