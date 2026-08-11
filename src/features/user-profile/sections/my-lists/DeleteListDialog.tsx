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
import type { UserVocabularyList } from "../../../../lib/vocabularyLists";

interface DeleteListDialogProps {
  list: UserVocabularyList | null;
  isDeleting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

// Confirmation for a destructive action — AlertDialog rather than the
// plain Dialog CreateListDialog/RenameListDialog use, matching
// UserProfileSidebar's own sign-out confirmation precedent (the only other
// "are you sure" prompt in this app). The confirm button is styled with
// the same destructive token set Button's own "destructive" variant uses,
// so Delete never reads as a routine primary action.
export function DeleteListDialog({ list, isDeleting, error, onOpenChange, onConfirm }: DeleteListDialogProps) {
  const { t } = useLanguage();

  return (
    <AlertDialog
      open={list !== null}
      onOpenChange={(nextOpen) => {
        if (!isDeleting) onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("userProfile.myListsSection.deleteDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("userProfile.myListsSection.deleteDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t("userProfile.myListsSection.modal.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={(event) => {
              // AlertDialogAction closes the dialog on click by default
              // (Radix AlertDialog.Action) — prevented here so the dialog
              // stays open (and disabled) for the duration of the delete
              // call; MyListsSection closes it itself once the RPC
              // resolves, matching Create/RenameListDialog's own
              // isSubmitting-gated close behavior.
              event.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60"
          >
            {t("userProfile.myListsSection.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
