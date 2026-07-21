import { useLanguage } from "../../../contexts/LanguageContext";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface AccountLanguageConfirmDialogProps {
  open: boolean;
  isSaving: boolean;
  error: string | null;
  onUseSelectedLanguages: () => void;
  onSaveToAccount: () => void;
  onCancel: () => void;
}

export function AccountLanguageConfirmDialog({
  open,
  isSaving,
  error,
  onUseSelectedLanguages,
  onSaveToAccount,
  onCancel,
}: AccountLanguageConfirmDialogProps) {
  const { t } = useLanguage();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("accountLanguageConfirm.title")}</DialogTitle>
          <DialogDescription>
            {t("accountLanguageConfirm.description")}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <DialogFooter className="sm:flex-col sm:gap-2">
          <Button
            type="button"
            onClick={onSaveToAccount}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving
              ? t("accountLanguageConfirm.saving")
              : t("accountLanguageConfirm.saveToAccount")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onUseSelectedLanguages}
            disabled={isSaving}
            className="w-full"
          >
            {t("accountLanguageConfirm.useSelected")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
            className="w-full"
          >
            {t("accountLanguageConfirm.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
