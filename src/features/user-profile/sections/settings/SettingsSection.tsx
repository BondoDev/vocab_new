import { useEffect, useState } from "react";
import { Toast, useAutoDismissMessage } from "../../../../app/components/Toast";
import { Button } from "../../../../app/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../app/components/ui/select";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { detectBrowserTimezone } from "../../../../app/utils/browserTimezone";
import { formatTimezoneOffset, getTimezoneCityLabel } from "../../../../app/utils/timezoneOptions";
import { useLanguage, type UILanguage } from "../../../../contexts/LanguageContext";
import {
  deleteAccount,
  isPasswordAccount,
  reauthenticateForAccountDeletion,
  ReauthenticationError,
  type ReauthenticationErrorReason,
} from "../../../../lib/accountDeletion";
import { describeSupabaseError, resolveSupabaseErrorMessageKey } from "../../../../lib/supabaseError";
import { SUPPORTED_LANGUAGE_CODES } from "../../../../lib/userProfileOnboarding";
import {
  resetLearningLanguageProgress,
  updateUserProfileLanguages,
  updateUserTimezone,
  writeStoredUserProfile,
  type UserProfile,
} from "../../../../lib/userProfile";
import { notifyWordProgressChanged } from "../../../../lib/sharedProgressInvalidation";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { ResetProgressDialog } from "./ResetProgressDialog";
import { TimezoneSelector } from "./TimezoneSelector";
import "./settings-section.scss";

export interface ProfileLanguagesChange {
  nativeLanguage: UILanguage;
  practiceLanguage: UILanguage;
  updatedAt: string;
}

export interface ProfileTimezoneChange {
  timezone: string;
  timezoneUpdatedAt: string;
}

interface SettingsSectionProps {
  // Same shared-profile prop every other section receives (see
  // UserProfileDashboardPage) — this section reads nickname/languages/level/
  // timezone from it and never fetches its own copy.
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  // Lets a successful language save push the new pair back up into
  // App.tsx's top-level yourLanguage/practiceLanguage state (used by the
  // learning entry points - NewWordStudyPreparation/ReviewWordsPreparation -
  // outside this dashboard) in addition to userProfile itself. Without this,
  // only the sections inside /profile would see the new language until a
  // reload; the same pattern onDailyGoalChange already uses for daily_goal.
  onProfileLanguagesChange?: (change: ProfileLanguagesChange) => void;
  onTimezoneChange?: (change: ProfileTimezoneChange) => void;
  // Called only after the delete-account Edge Function confirms success —
  // App.tsx wires this to the same session-cleanup path handleProfileSignOut
  // already uses, plus clearing the cached profile and navigating away.
  onAccountDeleted?: () => void | Promise<void>;
}

const SUPPORTED_LEVEL_CODES = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

// Maps each ReauthenticationError reason (accountDeletion.ts) to its own
// sanitized, localized message — deliberately distinct from a "delete
// failed" message: wrong credentials, a cross-account mismatch, a network
// hiccup verifying identity, and the server rejecting a request the
// frontend thought was fresh enough are four different, real outcomes (see
// the task brief's own failure-behavior section), never collapsed into one
// generic string.
const REAUTHENTICATION_ERROR_MESSAGE_KEYS: Record<ReauthenticationErrorReason, string> = {
  invalid_credentials: "userProfile.settingsSection.dataAccount.deleteDialog.incorrectPassword",
  identity_mismatch: "userProfile.settingsSection.dataAccount.deleteDialog.identityError",
  network: "userProfile.settingsSection.dataAccount.deleteDialog.identityError",
  backend_rejected: "userProfile.settingsSection.dataAccount.deleteDialog.reauthRequired",
};

export function SettingsSection({
  userProfile,
  isProfileLoaded,
  onProfileLanguagesChange,
  onTimezoneChange,
  onAccountDeleted,
}: SettingsSectionProps) {
  const { t } = useLanguage();
  const { authSession, authUserId } = useAuthSession();
  const email = authSession?.user?.email ?? "";

  // ---- Languages -----------------------------------------------------
  const [nativeDraft, setNativeDraft] = useState<UILanguage | "">(userProfile.nativeLanguage);
  const [practiceDraft, setPracticeDraft] = useState<UILanguage | "">(userProfile.practiceLanguage);
  const [isSavingLanguages, setIsSavingLanguages] = useState(false);
  const [languagesError, setLanguagesError] = useState<string | null>(null);
  const { message: languagesToast, show: showLanguagesToast } = useAutoDismissMessage();

  useEffect(() => {
    setNativeDraft(userProfile.nativeLanguage);
    setPracticeDraft(userProfile.practiceLanguage);
  }, [userProfile.nativeLanguage, userProfile.practiceLanguage]);

  const isLanguagesUnchanged =
    nativeDraft === userProfile.nativeLanguage && practiceDraft === userProfile.practiceLanguage;
  const canSaveLanguages =
    isProfileLoaded && Boolean(authSession) && Boolean(nativeDraft) && Boolean(practiceDraft) &&
    !isLanguagesUnchanged && !isSavingLanguages;

  const handleSaveLanguages = () => {
    if (!canSaveLanguages || !authSession || !authUserId || !nativeDraft || !practiceDraft) {
      return;
    }

    setIsSavingLanguages(true);
    setLanguagesError(null);

    // Narrow write: only the two language fields are sent — see
    // update_user_profile_languages's own migration for the exact columns
    // it can and cannot touch.
    void updateUserProfileLanguages(authSession, { nativeLanguage: nativeDraft, practiceLanguage: practiceDraft })
      .then((result) => {
        const nextProfile = writeStoredUserProfile(authUserId, {
          ...userProfile,
          nativeLanguage: result.nativeLanguage,
          practiceLanguage: result.practiceLanguage,
          updatedAt: result.updatedAt,
        });
        onProfileLanguagesChange?.({
          nativeLanguage: (result.nativeLanguage ?? nextProfile.nativeLanguage) as UILanguage,
          practiceLanguage: (result.practiceLanguage ?? nextProfile.practiceLanguage) as UILanguage,
          updatedAt: nextProfile.updatedAt ?? result.updatedAt ?? "",
        });
        showLanguagesToast(t("userProfile.settingsSection.languages.savedToast"));
      })
      .catch((error) => {
        const diagnostics = describeSupabaseError("updateUserProfileLanguages", error);
        console.warn("SettingsSection: failed to save language settings.", diagnostics);
        setLanguagesError(
          t(resolveSupabaseErrorMessageKey(diagnostics.category, "userProfile.settingsSection.languages.saveError")),
        );
        // Never leave a failed change looking saved — revert the drafts back
        // to the last confirmed profile values.
        setNativeDraft(userProfile.nativeLanguage);
        setPracticeDraft(userProfile.practiceLanguage);
      })
      .finally(() => {
        setIsSavingLanguages(false);
      });
  };

  // ---- Time & Region ---------------------------------------------------
  const [timezoneDraft, setTimezoneDraft] = useState<string>(userProfile.timezone ?? "");
  const [isSavingTimezone, setIsSavingTimezone] = useState(false);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const { message: timezoneToast, show: showTimezoneToast } = useAutoDismissMessage();

  useEffect(() => {
    setTimezoneDraft(userProfile.timezone ?? "");
  }, [userProfile.timezone]);

  const isTimezoneUnchanged = timezoneDraft === (userProfile.timezone ?? "");
  const canSaveTimezone =
    isProfileLoaded && Boolean(authSession) && timezoneDraft.trim().length > 0 && !isTimezoneUnchanged &&
    !isSavingTimezone;

  const handleUseCurrentTimezone = () => {
    const detected = detectBrowserTimezone();
    if (!detected) {
      setDetectionError(t("userProfile.settingsSection.timeRegion.detectionError"));
      return;
    }
    setDetectionError(null);
    setTimezoneError(null);
    setTimezoneDraft(detected);
  };

  const handleSaveTimezone = () => {
    if (!canSaveTimezone || !authSession || !authUserId) {
      return;
    }

    setIsSavingTimezone(true);
    setTimezoneError(null);

    // update_user_timezone (see supabase/migrations/20260812120000_add_
    // update_user_timezone_rpc.sql) — the explicit-replacement RPC, distinct
    // from initialize_user_timezone's automatic null-only first-load write
    // (still used only by useUserProfileLoad.ts). Unlike that RPC, this one
    // unconditionally overwrites an already-set timezone, which is exactly
    // what Settings' "Use current timezone"/searchable-selector Save action
    // needs. A defensive shape check (updated + the echoed value matching
    // what was requested) still guards against ever showing a false "saved"
    // state if the response is ever malformed.
    void updateUserTimezone(authSession, timezoneDraft)
      .then((result) => {
        if (!result.updated || result.timezone !== timezoneDraft) {
          setTimezoneError(t("userProfile.settingsSection.timeRegion.saveError"));
          setTimezoneDraft(userProfile.timezone ?? "");
          return;
        }

        const nextProfile = writeStoredUserProfile(authUserId, {
          ...userProfile,
          timezone: result.timezone,
          timezoneUpdatedAt: result.timezoneUpdatedAt,
        });
        onTimezoneChange?.({
          timezone: nextProfile.timezone ?? result.timezone,
          timezoneUpdatedAt: nextProfile.timezoneUpdatedAt ?? result.timezoneUpdatedAt,
        });
        showTimezoneToast(t("userProfile.settingsSection.timeRegion.savedToast"));
      })
      .catch((error) => {
        const diagnostics = describeSupabaseError("updateUserTimezone", error);
        console.warn("SettingsSection: failed to save timezone.", diagnostics);
        setTimezoneError(
          t(resolveSupabaseErrorMessageKey(diagnostics.category, "userProfile.settingsSection.timeRegion.saveError")),
        );
        setTimezoneDraft(userProfile.timezone ?? "");
      })
      .finally(() => {
        setIsSavingTimezone(false);
      });
  };

  const savedTimezoneOffset = userProfile.timezone ? formatTimezoneOffset(userProfile.timezone) : null;

  // ---- Data & Account: Reset progress -----------------------------------
  const [resetTargetLanguage, setResetTargetLanguage] = useState<UILanguage | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const { message: dataAccountToast, show: showDataAccountToast } = useAutoDismissMessage();

  const handleConfirmReset = () => {
    if (!resetTargetLanguage || isResetting || !authSession) {
      return;
    }

    setIsResetting(true);
    setResetError(null);

    void resetLearningLanguageProgress(authSession, resetTargetLanguage)
      .then(() => {
        setResetTargetLanguage(null);
        // Existing invalidation signal (src/lib/sharedProgressInvalidation.ts)
        // — the shared active-language word-progress rows
        // (useProfileSharedProgressData, kept alive across section switches
        // at the UserProfileDashboardPage level) refetch and correctly come
        // back empty. Daily-stats-derived cards (Daily Streak, Study
        // Activity, ...) live in sections that unmount when not active and
        // already fetch fresh on their next mount — no separate signal
        // exists for them today, and inventing one is out of scope here.
        notifyWordProgressChanged();
        showDataAccountToast(t("userProfile.settingsSection.dataAccount.resetDialog.successToast"));
      })
      .catch((error) => {
        const diagnostics = describeSupabaseError("resetLearningLanguageProgress", error);
        console.warn("SettingsSection: failed to reset learning progress.", diagnostics);
        setResetError(
          t(
            resolveSupabaseErrorMessageKey(
              diagnostics.category,
              "userProfile.settingsSection.dataAccount.resetDialog.saveError",
            ),
          ),
        );
      })
      .finally(() => {
        setIsResetting(false);
      });
  };

  // ---- Data & Account: Delete account -------------------------------
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");

  // Only password accounts need an in-dialog reauthentication step. Google
  // OAuth accounts delete using their current session as-is — see
  // recentAuth.ts's isCurrentSessionGoogleAuthenticated (product policy,
  // 2026-08-14) for why that's a deliberate decision, not a shortcut: the
  // Edge Function independently re-derives "is this really a currently
  // Google-authenticated session" from trusted server-side data before
  // ever skipping its recent-auth check, so nothing here needs to (or
  // could) fake that determination. Recomputed from the live session (not
  // cached), so it always reflects the actual signed-in account.
  const requiresPasswordReauth = isPasswordAccount(authSession);

  const handleConfirmDelete = () => {
    if (isDeleting || !authSession) {
      return;
    }
    if (requiresPasswordReauth && !deletePassword) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    void (async () => {
      try {
        // Reauthentication — see accountDeletion.ts's own header for the
        // full design. Password accounts must re-prove their password
        // immediately before the delete call; the resulting fresh session
        // (not the possibly-stale one this component started with) is what
        // actually authorizes the delete-account request, since the Edge
        // Function's own server-side recent-authentication check reads its
        // freshness off the bearer token used for that specific call.
        // Non-password accounts (Google OAuth) have no in-dialog
        // reauthentication step at all — the existing session is sent as
        // is, and the Edge Function decides server-side whether it's a
        // currently-valid Google-authenticated session (in which case the
        // 5-minute recency window this same check enforces for password
        // accounts does not apply — product policy, 2026-08-14).
        const sessionForDeletion = requiresPasswordReauth
          ? await reauthenticateForAccountDeletion(authSession, deletePassword)
          : authSession;

        await deleteAccount(sessionForDeletion);
        setIsDeleteDialogOpen(false);
        // Only clear local session/profile state after the backend confirms
        // deletion — App.tsx's handler clears the local Supabase session
        // directly (no network /auth/v1/logout call: the account no longer
        // exists server-side by this point, so that request would only ever
        // 403) and navigates away.
        void onAccountDeleted?.();
      } catch (error) {
        if (error instanceof ReauthenticationError) {
          console.warn("SettingsSection: reauthentication before account deletion failed.", {
            reason: error.reason,
          });
          setDeleteError(t(REAUTHENTICATION_ERROR_MESSAGE_KEYS[error.reason]));
          return;
        }

        const diagnostics = describeSupabaseError("deleteAccount", error);
        console.warn("SettingsSection: failed to delete account.", diagnostics);
        setDeleteError(
          t(
            resolveSupabaseErrorMessageKey(
              diagnostics.category,
              "userProfile.settingsSection.dataAccount.deleteDialog.saveError",
            ),
          ),
        );
      } finally {
        setIsDeleting(false);
        // Never keep a typed password around after any attempt, successful
        // or not — see DeleteAccountDialog.tsx's own clearing behavior for
        // the complementary "cleared on close" guarantee.
        setDeletePassword("");
      }
    })();
  };

  if (!isProfileLoaded) {
    return (
      <section className="settings-section" aria-busy="true">
        <header className="settings-section__header">
          <h1 className="settings-section__title">{t("userProfile.settingsSection.title")}</h1>
          <p className="settings-section__subtitle">{t("userProfile.settingsSection.subtitle")}</p>
        </header>
        <div className="settings-skeleton" role="status" aria-label={t("userProfile.settingsSection.loading")}>
          <div className="settings-skeleton__row" />
          <div className="settings-skeleton__row" />
          <div className="settings-skeleton__row" />
        </div>
      </section>
    );
  }

  return (
    <section className="settings-section" aria-labelledby="settings-section-title">
      <header className="settings-section__header">
        <h1 id="settings-section-title" className="settings-section__title">
          {t("userProfile.settingsSection.title")}
        </h1>
        <p className="settings-section__subtitle">{t("userProfile.settingsSection.subtitle")}</p>
      </header>

      {/* ---- Account ---- */}
      <section className="settings-surface" aria-labelledby="settings-account-heading">
        <h2 id="settings-account-heading" className="settings-surface__heading">
          {t("userProfile.settingsSection.account.title")}
        </h2>
        <div className="settings-row">
          <span className="settings-row__label">{t("userProfile.settingsSection.account.nickname")}</span>
          <span className="settings-row__value">{userProfile.nickname || "—"}</span>
        </div>
        <div className="settings-row">
          <span className="settings-row__label">{t("userProfile.settingsSection.account.email")}</span>
          <span className="settings-row__value">{email || "—"}</span>
        </div>
      </section>

      {/* ---- Languages ---- */}
      <section className="settings-surface" aria-labelledby="settings-languages-heading">
        <h2 id="settings-languages-heading" className="settings-surface__heading">
          {t("userProfile.settingsSection.languages.title")}
        </h2>

        <div className="settings-row">
          <span className="settings-row__label" id="settings-native-language-label">
            {t("userProfile.settingsSection.languages.native")}
          </span>
          <Select
            value={nativeDraft || undefined}
            onValueChange={(value) => setNativeDraft(value as UILanguage)}
            disabled={isSavingLanguages || !authSession}
          >
            <SelectTrigger aria-labelledby="settings-native-language-label" className="settings-row__control">
              <SelectValue placeholder={t("userProfile.settingsSection.languages.native")} />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGE_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {t(`languageNames.${code}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="settings-row">
          <span className="settings-row__label" id="settings-practice-language-label">
            {t("userProfile.settingsSection.languages.learning")}
          </span>
          <Select
            value={practiceDraft || undefined}
            onValueChange={(value) => setPracticeDraft(value as UILanguage)}
            disabled={isSavingLanguages || !authSession}
          >
            <SelectTrigger aria-labelledby="settings-practice-language-label" className="settings-row__control">
              <SelectValue placeholder={t("userProfile.settingsSection.languages.learning")} />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGE_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {t(`languageNames.${code}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="settings-row">
          <span className="settings-row__label">{t("userProfile.settingsSection.languages.currentLevel")}</span>
          <span className="settings-row__value">
            {userProfile.languageLevel && (SUPPORTED_LEVEL_CODES as readonly string[]).includes(userProfile.languageLevel)
              ? `${userProfile.languageLevel} · ${t(`levels.${userProfile.languageLevel}.name`)}`
              : "—"}
          </span>
        </div>

        <p className="settings-surface__helper">{t("userProfile.settingsSection.languages.changeNote")}</p>

        {languagesError ? (
          <div role="alert" className="settings-inline-error">
            {languagesError}
          </div>
        ) : null}

        <div className="settings-surface__actions">
          <Button type="button" onClick={handleSaveLanguages} disabled={!canSaveLanguages}>
            {isSavingLanguages ? t("userProfile.settingsSection.saving") : t("userProfile.settingsSection.save")}
          </Button>
        </div>

        <Toast message={languagesToast} />
      </section>

      {/* ---- Time & Region ---- */}
      <section className="settings-surface" aria-labelledby="settings-time-region-heading">
        <h2 id="settings-time-region-heading" className="settings-surface__heading">
          {t("userProfile.settingsSection.timeRegion.title")}
        </h2>

        <div className="settings-row">
          <span className="settings-row__label" id="settings-timezone-label">
            {t("userProfile.settingsSection.timeRegion.timezone")}
          </span>
          <TimezoneSelector
            value={timezoneDraft}
            onChange={(value) => {
              setTimezoneDraft(value);
              setDetectionError(null);
            }}
            disabled={isSavingTimezone || !authSession}
          />
        </div>

        {userProfile.timezone ? (
          <p className="settings-surface__helper settings-surface__helper--muted">
            {getTimezoneCityLabel(userProfile.timezone)} · {userProfile.timezone}
            {savedTimezoneOffset ? ` · ${savedTimezoneOffset}` : ""}
          </p>
        ) : null}

        <p className="settings-surface__helper">{t("userProfile.settingsSection.timeRegion.explanation")}</p>

        {detectionError ? (
          <div role="alert" className="settings-inline-error">
            {detectionError}
          </div>
        ) : null}
        {timezoneError ? (
          <div role="alert" className="settings-inline-error">
            {timezoneError}
          </div>
        ) : null}

        <div className="settings-surface__actions">
          <Button type="button" variant="outline" onClick={handleUseCurrentTimezone} disabled={isSavingTimezone}>
            {t("userProfile.settingsSection.timeRegion.useCurrent")}
          </Button>
          <Button type="button" onClick={handleSaveTimezone} disabled={!canSaveTimezone}>
            {isSavingTimezone ? t("userProfile.settingsSection.saving") : t("userProfile.settingsSection.save")}
          </Button>
        </div>

        <Toast message={timezoneToast} />
      </section>

      {/* ---- Data & Account (danger zone) ---- */}
      <section className="settings-surface settings-surface--danger" aria-labelledby="settings-data-account-heading">
        <h2 id="settings-data-account-heading" className="settings-surface__heading">
          {t("userProfile.settingsSection.dataAccount.title")}
        </h2>

        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__label">
              {userProfile.practiceLanguage
                ? t("userProfile.settingsSection.dataAccount.resetRowLabel").replace(
                    "{language}",
                    t(`languageNames.${userProfile.practiceLanguage}`),
                  )
                : t("userProfile.settingsSection.dataAccount.resetProgress")}
            </span>
            <p className="settings-row__description">
              {t("userProfile.settingsSection.dataAccount.resetDescription")}
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={!userProfile.practiceLanguage || !authSession}
            onClick={() => setResetTargetLanguage((userProfile.practiceLanguage || null) as UILanguage | null)}
          >
            {t("userProfile.settingsSection.dataAccount.resetProgress")}
          </Button>
        </div>

        <div className="settings-row">
          <div className="settings-row__text">
            <span className="settings-row__label">{t("userProfile.settingsSection.dataAccount.deleteAccount")}</span>
            <p className="settings-row__description">
              {t("userProfile.settingsSection.dataAccount.deleteDescription")}
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={!authSession}
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            {t("userProfile.settingsSection.dataAccount.deleteAccount")}
          </Button>
        </div>

        <Toast message={dataAccountToast} />
      </section>

      <ResetProgressDialog
        targetLanguage={resetTargetLanguage}
        isResetting={isResetting}
        error={resetError}
        onOpenChange={(open) => {
          if (!open) {
            setResetTargetLanguage(null);
            setResetError(null);
          }
        }}
        onConfirm={handleConfirmReset}
      />

      <DeleteAccountDialog
        open={isDeleteDialogOpen}
        isDeleting={isDeleting}
        error={deleteError}
        requiresPassword={requiresPasswordReauth}
        password={deletePassword}
        onPasswordChange={setDeletePassword}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (!open) {
            setDeleteError(null);
            // Never leave a typed password sitting in state once the
            // dialog closes, whether via Cancel or the backdrop/Escape.
            // The password is a controlled value owned here (not inside
            // DeleteAccountDialog, unlike the DELETE confirmation text)
            // because handleConfirmDelete needs its actual value, not just
            // a validity boolean.
            setDeletePassword("");
          }
        }}
        onConfirm={handleConfirmDelete}
      />
    </section>
  );
}
