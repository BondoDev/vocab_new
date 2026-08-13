import { useEffect, useRef, useState } from "react";
import { Toast, useAutoDismissMessage } from "../../../../app/components/Toast";
import { Button } from "../../../../app/components/ui/button";
import { Input } from "../../../../app/components/ui/input";
import { Label } from "../../../../app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../app/components/ui/select";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { detectBrowserTimezone } from "../../../../app/utils/browserTimezone";
import { getPendingEmailFromUser, isDuplicateEmailError, normalizeEmailInput } from "../../../../app/utils/settingsEmail";
import { normalizeNicknameInput } from "../../../../app/utils/settingsNickname";
import { normalizeNewPasswordInput } from "../../../../app/utils/settingsPassword";
import { formatTimezoneOffset, getTimezoneCityLabel } from "../../../../app/utils/timezoneOptions";
import { useLanguage, type UILanguage } from "../../../../contexts/LanguageContext";
import {
  deleteAccount,
  isPasswordAccount,
  reauthenticateForAccountDeletion,
  ReauthenticationError,
  type ReauthenticationErrorReason,
} from "../../../../lib/accountDeletion";
import { updateAccountEmail } from "../../../../lib/accountEmailChange";
import { updateSupabaseAuthUserPassword } from "../../../../lib/supabaseAuth";
import { describeSupabaseError, resolveSupabaseErrorMessageKey } from "../../../../lib/supabaseError";
import { SUPPORTED_LANGUAGE_CODES, SUPPORTED_LEVEL_CODES } from "../../../../lib/userProfileOnboarding";
import {
  resetLearningLanguageProgress,
  updateUserNickname,
  updateUserProfileLearningPreferences,
  updateUserTimezone,
  writeStoredUserProfile,
  type LanguageLevelCode,
  type UserProfile,
} from "../../../../lib/userProfile";
import { notifyWordProgressChanged } from "../../../../lib/sharedProgressInvalidation";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { ResetProgressDialog } from "./ResetProgressDialog";
import { TimezoneSelector } from "./TimezoneSelector";
import "./settings-section.scss";

export interface ProfileNicknameChange {
  nickname: string;
  updatedAt: string;
}

export interface ProfileLanguagesChange {
  nativeLanguage: UILanguage;
  practiceLanguage: UILanguage;
  // Settings Current Level editing follow-up — the Languages card's single
  // Save now also persists current_level atomically alongside the language
  // pair (see update_user_profile_learning_preferences), so this change
  // payload carries all three so App.tsx's shared userProfile state stays
  // in sync in one update, never a second separate "level changed" event.
  languageLevel: LanguageLevelCode;
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
  // Nickname editing follow-up — same shared-profile-state pattern as
  // onProfileLanguagesChange/onTimezoneChange below: a successful nickname
  // save pushes the new value back up into App.tsx's userProfile state so
  // every other currently-mounted piece of UI reading userProfile.nickname
  // (UserProfileSidebar, DashboardSection's greeting, ...) picks it up
  // immediately, with no second nickname state source and no reload.
  onNicknameChange?: (change: ProfileNicknameChange) => void;
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

// Same reason set, its own password-change-specific wording — reuses
// reauthenticateForAccountDeletion (accountDeletion.ts) itself rather than a
// second reauthentication implementation, but "Incorrect password." (the
// delete dialog's own copy) reads oddly for a "verify your current
// password before changing it" flow, so this flow gets its own strings for
// the same three reasons that function can actually throw.
// "backend_rejected" is never thrown by reauthenticateForAccountDeletion
// itself (only deleteAccount's own wrapping re-throws that reason) — kept
// here only so this remains a total, type-checked map over every
// ReauthenticationErrorReason.
const PASSWORD_REAUTHENTICATION_ERROR_MESSAGE_KEYS: Record<ReauthenticationErrorReason, string> = {
  invalid_credentials: "userProfile.settingsSection.account.passwordCurrentIncorrect",
  identity_mismatch: "userProfile.settingsSection.account.passwordIdentityError",
  network: "userProfile.settingsSection.account.passwordIdentityError",
  backend_rejected: "userProfile.settingsSection.account.passwordSaveError",
};

export function SettingsSection({
  userProfile,
  isProfileLoaded,
  onNicknameChange,
  onProfileLanguagesChange,
  onTimezoneChange,
  onAccountDeleted,
}: SettingsSectionProps) {
  const { t } = useLanguage();
  const { authSession, authUserId } = useAuthSession();
  const email = authSession?.user?.email ?? "";

  // ---- Account: Nickname (inline edit) --------------------------------
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState(userProfile.nickname);
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [nicknameSaveError, setNicknameSaveError] = useState<string | null>(null);
  const { message: nicknameToast, show: showNicknameToast } = useAutoDismissMessage();
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const nicknameEditButtonRef = useRef<HTMLButtonElement>(null);

  // Focus moves into the input the moment edit mode opens — the one
  // "practical" focus-management step this task's own brief asks for.
  useEffect(() => {
    if (isEditingNickname) {
      nicknameInputRef.current?.focus();
    }
  }, [isEditingNickname]);

  const nicknameValidation = normalizeNicknameInput(nicknameDraft);
  const isNicknameUnchanged = nicknameValidation.ok && nicknameValidation.value === userProfile.nickname;
  const canSaveNickname =
    isEditingNickname && isProfileLoaded && Boolean(authSession) && nicknameValidation.ok &&
    !isNicknameUnchanged && !isSavingNickname;
  // Explicit `=== false` (not a bare `!nicknameValidation.ok`) — matches
  // accountOnboarding.ts's own prepareAccountOnboardingSubmit/
  // useAccountOnboarding.ts precedent for narrowing this exact
  // `{ ok: true; ... } | { ok: false; ... }` result shape.
  let nicknameValidationErrorKey: string | null = null;
  if (nicknameValidation.ok === false && nicknameDraft.trim().length > 0) {
    const suffix =
      nicknameValidation.reason === "empty" ? "Required" : nicknameValidation.reason === "tooLong" ? "TooLong" : "Invalid";
    nicknameValidationErrorKey = `userProfile.settingsSection.account.nickname${suffix}`;
  }

  const handleStartEditNickname = () => {
    setNicknameDraft(userProfile.nickname);
    setNicknameSaveError(null);
    setIsEditingNickname(true);
  };

  const handleCancelEditNickname = () => {
    setIsEditingNickname(false);
    setNicknameDraft(userProfile.nickname);
    setNicknameSaveError(null);
    nicknameEditButtonRef.current?.focus();
  };

  const handleSaveNickname = () => {
    if (!canSaveNickname || !authSession || !authUserId || !nicknameValidation.ok || isSavingNickname) {
      return;
    }

    setIsSavingNickname(true);
    setNicknameSaveError(null);

    // Narrow write: only the nickname is sent — see update_user_nickname's
    // own migration for the exact single column (plus updated_at) it can
    // touch.
    void updateUserNickname(authSession, nicknameValidation.value)
      .then((result) => {
        const nextProfile = writeStoredUserProfile(authUserId, {
          ...userProfile,
          nickname: result.nickname,
          updatedAt: result.updatedAt,
        });
        onNicknameChange?.({
          nickname: nextProfile.nickname,
          updatedAt: nextProfile.updatedAt ?? result.updatedAt,
        });
        setIsEditingNickname(false);
        showNicknameToast(t("userProfile.settingsSection.account.nicknameSavedToast"));
        nicknameEditButtonRef.current?.focus();
      })
      .catch((error) => {
        const diagnostics = describeSupabaseError("updateUserNickname", error);
        console.warn("SettingsSection: failed to save nickname.", diagnostics);
        setNicknameSaveError(
          t(
            resolveSupabaseErrorMessageKey(
              diagnostics.category,
              "userProfile.settingsSection.account.nicknameSaveError",
            ),
          ),
        );
        // Never leave a failed change looking persisted — edit mode stays
        // open with the user's draft untouched, and userProfile.nickname
        // (the confirmed value) was never written to.
      })
      .finally(() => {
        setIsSavingNickname(false);
      });
  };

  // ---- Account: Email (inline edit) ------------------------------------
  // Google-linked accounts never get the Change action — this project's
  // actual GoTrue configuration (double_confirm_changes=true) can technically
  // accept an email PUT for any provider, but doing so would only change the
  // login email while leaving the Google identity's own email untouched,
  // producing a permanently diverging, confusing state this task's own brief
  // explicitly says to avoid ("do not fake support"). Reuses
  // isPasswordAccount (accountDeletion.ts) — the same provider check already
  // used for account-deletion reauthentication — instead of a second,
  // parallel provider check.
  const canChangeEmail = isPasswordAccount(authSession);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState(email);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailSaveError, setEmailSaveError] = useState<string | null>(null);
  const { message: emailToast, show: showEmailToast } = useAutoDismissMessage();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const emailChangeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isEditingEmail) {
      emailInputRef.current?.focus();
    }
  }, [isEditingEmail]);

  // Derived directly from the live session's own new_email field (GoTrue's
  // real pending-change indicator) on every render — never a separate,
  // Settings-owned "is a change pending" flag that could go stale. Refreshes
  // automatically the moment updateAccountEmail below adopts an updated
  // session, with no reload.
  const pendingEmail = getPendingEmailFromUser(authSession?.user);

  const emailValidation = normalizeEmailInput(emailDraft);
  const isEmailUnchanged = emailValidation.ok && emailValidation.value === email;
  const canSaveEmail =
    isEditingEmail && Boolean(authSession) && canChangeEmail && emailValidation.ok &&
    !isEmailUnchanged && !isSavingEmail;
  // Explicit `=== false` — same narrowing precedent as nicknameValidation
  // above (accountOnboarding.ts's prepareAccountOnboardingSubmit).
  let emailValidationErrorKey: string | null = null;
  if (emailValidation.ok === false && emailDraft.trim().length > 0) {
    emailValidationErrorKey = `userProfile.settingsSection.account.email${
      emailValidation.reason === "empty" ? "Required" : "Invalid"
    }`;
  }

  const handleStartEditEmail = () => {
    setEmailDraft(email);
    setEmailSaveError(null);
    setIsEditingEmail(true);
  };

  const handleCancelEditEmail = () => {
    setIsEditingEmail(false);
    setEmailDraft(email);
    setEmailSaveError(null);
    emailChangeButtonRef.current?.focus();
  };

  const handleSaveEmail = () => {
    if (!canSaveEmail || !authSession || !emailValidation.ok || isSavingEmail) {
      return;
    }

    setIsSavingEmail(true);
    setEmailSaveError(null);

    // Auth write, not a user_profiles write — see accountEmailChange.ts's
    // own header for the full ownership/security model.
    void updateAccountEmail(authSession, emailValidation.value)
      .then((result) => {
        setIsEditingEmail(false);
        if (result.pendingEmail) {
          // The expected outcome under this project's actual configuration
          // (double_confirm_changes=true) — the email is not yet confirmed,
          // so this must never be phrased as "updated."
          showEmailToast(t("userProfile.settingsSection.account.emailChangePending"));
        } else if (result.email && result.email !== email) {
          // Only reachable if this project's Auth configuration is ever
          // relaxed to immediate replacement — kept so this component stays
          // correct in that case instead of silently showing nothing.
          showEmailToast(t("userProfile.settingsSection.account.emailUpdatedToast"));
        }
        emailChangeButtonRef.current?.focus();
      })
      .catch((error) => {
        if (isDuplicateEmailError(error)) {
          // A specific, sanitized message — never GoTrue's raw body — for
          // the one error this task's own brief calls out by name. Checked
          // before the generic classifier below so it is never diluted into
          // a generic "could not update email" message.
          setEmailSaveError(t("userProfile.settingsSection.account.emailChangeDuplicate"));
          return;
        }

        const diagnostics = describeSupabaseError("updateAccountEmail", error);
        console.warn("SettingsSection: failed to change email.", diagnostics);
        setEmailSaveError(
          t(
            resolveSupabaseErrorMessageKey(
              diagnostics.category,
              "userProfile.settingsSection.account.emailSaveError",
            ),
          ),
        );
        // Never leave a failed change looking requested — edit mode stays
        // open with the user's draft untouched, and the confirmed email
        // (authSession.user.email) was never touched.
      })
      .finally(() => {
        setIsSavingEmail(false);
      });
  };

  // ---- Account: Password (inline edit, password accounts only) --------
  // Google-linked accounts have no FluentStellar password to change at
  // all — reuses isPasswordAccount (accountDeletion.ts), the same provider
  // check canChangeEmail above already uses, instead of a second, parallel
  // provider check.
  const canChangePassword = isPasswordAccount(authSession);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordSaveError, setPasswordSaveError] = useState<string | null>(null);
  const { message: passwordToast, show: showPasswordToast } = useAutoDismissMessage();
  const currentPasswordInputRef = useRef<HTMLInputElement>(null);
  const passwordChangeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isEditingPassword) {
      currentPasswordInputRef.current?.focus();
    }
  }, [isEditingPassword]);

  const newPasswordValidation = normalizeNewPasswordInput(newPasswordDraft);
  const isPasswordConfirmMismatch = confirmPasswordDraft.length > 0 && confirmPasswordDraft !== newPasswordDraft;
  const canSavePassword =
    isEditingPassword && canChangePassword && currentPasswordDraft.length > 0 && newPasswordValidation.ok &&
    confirmPasswordDraft === newPasswordDraft && !isSavingPassword;
  // Explicit `=== false` — same narrowing precedent as nicknameValidation/
  // emailValidation above (accountOnboarding.ts's prepareAccountOnboardingSubmit).
  // normalizeNewPasswordInput's "empty" reason can never fire once
  // newPasswordDraft.length > 0 (unlike email/nickname, nothing is trimmed
  // here), so this guard only ever surfaces "tooShort".
  let passwordValidationErrorKey: string | null = null;
  if (newPasswordValidation.ok === false && newPasswordDraft.length > 0) {
    passwordValidationErrorKey = "userProfile.settingsSection.account.passwordTooShort";
  } else if (isPasswordConfirmMismatch) {
    passwordValidationErrorKey = "userProfile.settingsSection.account.passwordMismatch";
  }

  const handleStartEditPassword = () => {
    setCurrentPasswordDraft("");
    setNewPasswordDraft("");
    setConfirmPasswordDraft("");
    setPasswordSaveError(null);
    setIsEditingPassword(true);
  };

  const handleCancelEditPassword = () => {
    setIsEditingPassword(false);
    setCurrentPasswordDraft("");
    setNewPasswordDraft("");
    setConfirmPasswordDraft("");
    setPasswordSaveError(null);
    passwordChangeButtonRef.current?.focus();
  };

  const handleSavePassword = () => {
    if (!canSavePassword || !authSession || !newPasswordValidation.ok || isSavingPassword) {
      return;
    }

    setIsSavingPassword(true);
    setPasswordSaveError(null);

    void (async () => {
      try {
        // Reauthentication — the exact same genuine, server-verified
        // current-password check account deletion uses
        // (reauthenticateForAccountDeletion, accountDeletion.ts), never a
        // second reauthentication implementation and never a client-side
        // password comparison. Only once the CURRENT password is verified
        // through Supabase Auth does the resulting fresh session drive the
        // actual password update below — see that function's own header
        // for the cross-account identity-mismatch guard this gets for
        // free, and this component's own onOpenChange precedent
        // (DeleteAccountDialog wiring, below) for why adopting that fresh
        // session is the correct, existing session-adoption architecture
        // to preserve rather than bypass.
        const freshSession = await reauthenticateForAccountDeletion(authSession, currentPasswordDraft);

        // The existing Supabase Auth password-update helper
        // (supabaseAuth.ts) — never a direct auth.users write, never the
        // Admin API. Driven by the freshly-reauthenticated session, not
        // the possibly-stale authSession prop.
        await updateSupabaseAuthUserPassword(freshSession, newPasswordValidation.value);

        setIsEditingPassword(false);
        setCurrentPasswordDraft("");
        setNewPasswordDraft("");
        setConfirmPasswordDraft("");
        showPasswordToast(t("userProfile.settingsSection.account.passwordChangedToast"));
        passwordChangeButtonRef.current?.focus();
      } catch (error) {
        if (error instanceof ReauthenticationError) {
          console.warn("SettingsSection: reauthentication before password change failed.", {
            reason: error.reason,
          });
          setPasswordSaveError(t(PASSWORD_REAUTHENTICATION_ERROR_MESSAGE_KEYS[error.reason]));
          return;
        }

        const diagnostics = describeSupabaseError("updateSupabaseAuthUserPassword", error);
        console.warn("SettingsSection: failed to change password.", diagnostics);
        setPasswordSaveError(
          t(
            resolveSupabaseErrorMessageKey(
              diagnostics.category,
              "userProfile.settingsSection.account.passwordSaveError",
            ),
          ),
        );
        // Never leave a failed change looking applied — edit mode stays
        // open, and the new/confirm drafts are left exactly as typed so the
        // user can correct just the current password and retry without
        // re-entering everything.
      } finally {
        setIsSavingPassword(false);
        // Never keep a typed current password around after any attempt,
        // successful or not — mirrors handleConfirmDelete's own
        // setDeletePassword("") guarantee below.
        setCurrentPasswordDraft("");
      }
    })();
  };

  // ---- Languages -----------------------------------------------------
  const [nativeDraft, setNativeDraft] = useState<UILanguage | "">(userProfile.nativeLanguage);
  const [practiceDraft, setPracticeDraft] = useState<UILanguage | "">(userProfile.practiceLanguage);
  // Current Level editing follow-up — a third draft alongside the two
  // language drafts, all saved together through one atomic RPC (see
  // handleSaveLanguages below). Local draft only; confirmed state always
  // comes from userProfile.languageLevel, same as native/practiceDraft.
  const [levelDraft, setLevelDraft] = useState<LanguageLevelCode | "">(userProfile.languageLevel);
  const [isSavingLanguages, setIsSavingLanguages] = useState(false);
  const [languagesError, setLanguagesError] = useState<string | null>(null);
  const { message: languagesToast, show: showLanguagesToast } = useAutoDismissMessage();

  useEffect(() => {
    setNativeDraft(userProfile.nativeLanguage);
    setPracticeDraft(userProfile.practiceLanguage);
    setLevelDraft(userProfile.languageLevel);
  }, [userProfile.nativeLanguage, userProfile.practiceLanguage, userProfile.languageLevel]);

  const isLanguagesUnchanged =
    nativeDraft === userProfile.nativeLanguage &&
    practiceDraft === userProfile.practiceLanguage &&
    levelDraft === userProfile.languageLevel;
  const canSaveLanguages =
    isProfileLoaded && Boolean(authSession) && Boolean(nativeDraft) && Boolean(practiceDraft) && Boolean(levelDraft) &&
    !isLanguagesUnchanged && !isSavingLanguages;

  const handleSaveLanguages = () => {
    if (!canSaveLanguages || !authSession || !authUserId || !nativeDraft || !practiceDraft || !levelDraft) {
      return;
    }

    setIsSavingLanguages(true);
    setLanguagesError(null);

    // Narrow atomic write: native language + learning language + current
    // level are sent together in one call — see
    // update_user_profile_learning_preferences's own migration for the
    // exact columns it can and cannot touch, and for why this is one RPC
    // rather than two sequential ones (no partial-save outcome possible).
    void updateUserProfileLearningPreferences(authSession, {
      nativeLanguage: nativeDraft,
      practiceLanguage: practiceDraft,
      languageLevel: levelDraft,
    })
      .then((result) => {
        const nextProfile = writeStoredUserProfile(authUserId, {
          ...userProfile,
          nativeLanguage: result.nativeLanguage,
          practiceLanguage: result.practiceLanguage,
          languageLevel: result.languageLevel,
          updatedAt: result.updatedAt,
        });
        onProfileLanguagesChange?.({
          nativeLanguage: (result.nativeLanguage ?? nextProfile.nativeLanguage) as UILanguage,
          practiceLanguage: (result.practiceLanguage ?? nextProfile.practiceLanguage) as UILanguage,
          languageLevel: (result.languageLevel || nextProfile.languageLevel) as LanguageLevelCode,
          updatedAt: nextProfile.updatedAt ?? result.updatedAt ?? "",
        });
        showLanguagesToast(t("userProfile.settingsSection.languages.savedToast"));
      })
      .catch((error) => {
        const diagnostics = describeSupabaseError("updateUserProfileLearningPreferences", error);
        console.warn("SettingsSection: failed to save language settings.", diagnostics);
        setLanguagesError(
          t(resolveSupabaseErrorMessageKey(diagnostics.category, "userProfile.settingsSection.languages.saveError")),
        );
        // Never leave a failed change looking saved — revert all three
        // drafts back to the last confirmed profile values.
        setNativeDraft(userProfile.nativeLanguage);
        setPracticeDraft(userProfile.practiceLanguage);
        setLevelDraft(userProfile.languageLevel);
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
          <span className="settings-row__label" id="settings-nickname-label">
            {t("userProfile.settingsSection.account.nickname")}
          </span>
          {isEditingNickname ? (
            <div className="settings-nickname-edit">
              <Input
                id="settings-nickname-input"
                ref={nicknameInputRef}
                aria-labelledby="settings-nickname-label"
                className="settings-row__control settings-nickname-edit__input"
                value={nicknameDraft}
                onChange={(event) => setNicknameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSaveNickname();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    handleCancelEditNickname();
                  }
                }}
                disabled={isSavingNickname}
                aria-invalid={nicknameValidationErrorKey ? true : undefined}
                aria-describedby={nicknameValidationErrorKey || nicknameSaveError ? "settings-nickname-error" : undefined}
              />
              <div className="settings-nickname-edit__actions">
                <Button type="button" size="sm" onClick={handleSaveNickname} disabled={!canSaveNickname}>
                  {isSavingNickname ? t("userProfile.settingsSection.saving") : t("userProfile.settingsSection.save")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCancelEditNickname}
                  disabled={isSavingNickname}
                >
                  {t("userProfile.settingsSection.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="settings-nickname-display">
              <span className="settings-row__value">{userProfile.nickname || "—"}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                ref={nicknameEditButtonRef}
                onClick={handleStartEditNickname}
                disabled={!authSession}
                aria-label={t("userProfile.settingsSection.account.editNickname")}
              >
                {t("userProfile.settingsSection.change")}
              </Button>
            </div>
          )}
        </div>

        {nicknameValidationErrorKey || nicknameSaveError ? (
          <div role="alert" id="settings-nickname-error" className="settings-inline-error">
            {nicknameSaveError ?? t(nicknameValidationErrorKey as string)}
          </div>
        ) : null}

        <Toast message={nicknameToast} />

        <div className="settings-row">
          <span className="settings-row__label" id="settings-email-label">
            {t("userProfile.settingsSection.account.email")}
          </span>
          {isEditingEmail ? (
            <div className="settings-email-edit">
              <Input
                id="settings-email-input"
                ref={emailInputRef}
                type="email"
                autoComplete="email"
                aria-labelledby="settings-email-label"
                className="settings-row__control settings-email-edit__input"
                value={emailDraft}
                onChange={(event) => setEmailDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSaveEmail();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    handleCancelEditEmail();
                  }
                }}
                disabled={isSavingEmail}
                aria-invalid={emailValidationErrorKey ? true : undefined}
                aria-describedby={emailValidationErrorKey || emailSaveError ? "settings-email-error" : undefined}
              />
              <div className="settings-email-edit__actions">
                <Button type="button" size="sm" onClick={handleSaveEmail} disabled={!canSaveEmail}>
                  {isSavingEmail ? t("userProfile.settingsSection.saving") : t("userProfile.settingsSection.save")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCancelEditEmail}
                  disabled={isSavingEmail}
                >
                  {t("userProfile.settingsSection.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="settings-email-display">
              <span className="settings-row__value">{email || "—"}</span>
              {canChangeEmail ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  ref={emailChangeButtonRef}
                  onClick={handleStartEditEmail}
                  disabled={!authSession}
                  aria-label={t("userProfile.settingsSection.account.changeEmail")}
                >
                  {t("userProfile.settingsSection.change")}
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {!canChangeEmail ? (
          <p className="settings-surface__helper settings-surface__helper--muted">
            {t("userProfile.settingsSection.account.emailUnavailableGoogle")}
          </p>
        ) : null}

        {pendingEmail ? (
          <p role="status" className="settings-email-pending">
            {t("userProfile.settingsSection.account.emailChangePendingLabel")} {pendingEmail}
          </p>
        ) : null}

        {emailValidationErrorKey || emailSaveError ? (
          <div role="alert" id="settings-email-error" className="settings-inline-error">
            {emailSaveError ?? t(emailValidationErrorKey as string)}
          </div>
        ) : null}

        <Toast message={emailToast} />

        <div className={`settings-row settings-password-row${isEditingPassword ? " settings-password-row--editing" : ""}`}>
          <span className="settings-row__label" id="settings-password-label">
            {t("userProfile.settingsSection.account.password")}
          </span>
          {isEditingPassword ? (
            <div className="settings-password-edit">
              <div className="settings-password-edit__field">
                <Label htmlFor="settings-current-password-input">
                  {t("userProfile.settingsSection.account.currentPassword")}
                </Label>
                <Input
                  id="settings-current-password-input"
                  ref={currentPasswordInputRef}
                  type="password"
                  autoComplete="current-password"
                  className="settings-password-edit__input"
                  value={currentPasswordDraft}
                  onChange={(event) => setCurrentPasswordDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSavePassword();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      handleCancelEditPassword();
                    }
                  }}
                  disabled={isSavingPassword}
                  aria-invalid={passwordSaveError ? true : undefined}
                  aria-describedby={passwordSaveError ? "settings-password-error" : undefined}
                />
              </div>
              <div className="settings-password-edit__field">
                <Label htmlFor="settings-new-password-input">
                  {t("userProfile.settingsSection.account.newPassword")}
                </Label>
                <Input
                  id="settings-new-password-input"
                  type="password"
                  autoComplete="new-password"
                  className="settings-password-edit__input"
                  value={newPasswordDraft}
                  onChange={(event) => setNewPasswordDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSavePassword();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      handleCancelEditPassword();
                    }
                  }}
                  disabled={isSavingPassword}
                  aria-invalid={passwordValidationErrorKey ? true : undefined}
                  aria-describedby={passwordValidationErrorKey || passwordSaveError ? "settings-password-error" : undefined}
                />
              </div>
              <div className="settings-password-edit__field">
                <Label htmlFor="settings-confirm-password-input">
                  {t("userProfile.settingsSection.account.confirmNewPassword")}
                </Label>
                <Input
                  id="settings-confirm-password-input"
                  type="password"
                  autoComplete="new-password"
                  className="settings-password-edit__input"
                  value={confirmPasswordDraft}
                  onChange={(event) => setConfirmPasswordDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSavePassword();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      handleCancelEditPassword();
                    }
                  }}
                  disabled={isSavingPassword}
                  aria-invalid={passwordValidationErrorKey ? true : undefined}
                  aria-describedby={passwordValidationErrorKey || passwordSaveError ? "settings-password-error" : undefined}
                />
              </div>
              <div className="settings-password-edit__actions">
                <Button type="button" size="sm" onClick={handleSavePassword} disabled={!canSavePassword}>
                  {isSavingPassword ? t("userProfile.settingsSection.saving") : t("userProfile.settingsSection.save")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCancelEditPassword}
                  disabled={isSavingPassword}
                >
                  {t("userProfile.settingsSection.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="settings-password-display">
              <span className="settings-row__value" aria-hidden="true">
                ••••••••
              </span>
              {canChangePassword ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  ref={passwordChangeButtonRef}
                  onClick={handleStartEditPassword}
                  disabled={!authSession}
                  aria-label={t("userProfile.settingsSection.account.changePassword")}
                >
                  {t("userProfile.settingsSection.change")}
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {!canChangePassword ? (
          <p className="settings-surface__helper settings-surface__helper--muted">
            {t("userProfile.settingsSection.account.passwordManagedByGoogle")}
          </p>
        ) : null}

        {passwordValidationErrorKey || passwordSaveError ? (
          <div role="alert" id="settings-password-error" className="settings-inline-error">
            {passwordSaveError ?? t(passwordValidationErrorKey as string)}
          </div>
        ) : null}

        <Toast message={passwordToast} />
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
          <span className="settings-row__label" id="settings-current-level-label">
            {t("userProfile.settingsSection.languages.currentLevel")}
          </span>
          <Select
            value={levelDraft || undefined}
            onValueChange={(value) => setLevelDraft(value as LanguageLevelCode)}
            disabled={isSavingLanguages || !authSession}
          >
            <SelectTrigger aria-labelledby="settings-current-level-label" className="settings-row__control">
              <SelectValue placeholder={t("userProfile.settingsSection.languages.currentLevel")} />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LEVEL_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {`${code} · ${t(`levels.${code}.name`)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
