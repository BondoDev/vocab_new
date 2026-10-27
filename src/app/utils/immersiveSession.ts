// Mobile immersive learning sessions (Custom Practice, Study New Words,
// Review Words): fullscreen entry/exit and the document-level "immersive"
// state the session layout keys off. Framework-free so it can be unit-tested
// with stubbed browser globals (scripts/tests/runtime/test-immersive-session.mjs);
// the React side is ImmersiveSessionFrame in components/layout/.
//
// Two independent layers:
//
// 1. Fullscreen (Fullscreen API). Requested only by requestSessionFullscreen(),
//    which must be called synchronously from the click that starts a session
//    (browsers require transient user activation). Never re-requested by
//    effects, so a user who leaves fullscreen (system back, swipe) stays out
//    of it. Unsupported (iPhone Safari has no element fullscreen), standalone
//    PWA, or rejected requests simply fall through to layer 2.
// 2. Immersive layout. While a session frame is mounted and the session is
//    expanded (the default on phones; toggled on any device via
//    toggleSessionExpanded), <html> carries IMMERSIVE_SESSION_CLASS and the viewport meta gains
//    viewport-fit=cover, so CSS can hide site chrome and respect safe areas.
//    Release is deferred one task so a frame swap in the same commit
//    (loading -> session, StrictMode's mount/unmount/mount) does not flicker
//    or drop fullscreen.
// 3. Visual-viewport tracking. While the layout is applied, the visible
//    viewport's height/offset are mirrored into CSS custom properties so the
//    fixed session shell ends at the top of the on-screen keyboard and
//    follows iOS Safari's visual-viewport panning. CSS alone can't do this:
//    dvh ignores the keyboard, and iOS ignores interactive-widget.
//
// Neither layer ever touches session state: leaving fullscreen or releasing
// the layout never finishes a session or discards progress.

export const IMMERSIVE_SESSION_CLASS = "immersive-session";

// Phones start sessions expanded; tablets and desktops start in their normal
// layout. The shorter screen side stays under 600 CSS px on phones in either
// orientation.
const PHONE_MAX_SHORT_SIDE = 600;

interface FullscreenCapableElement {
  requestFullscreen?: (options?: { navigationUI?: "auto" | "hide" | "show" }) => Promise<void>;
  webkitRequestFullscreen?: () => void;
}

interface FullscreenCapableDocument {
  documentElement: FullscreenCapableElement & {
    classList: DOMTokenList;
    style: Pick<CSSStyleDeclaration, "setProperty" | "removeProperty">;
  };
  activeElement?: Element | null;
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
  querySelector: Document["querySelector"];
  addEventListener: Document["addEventListener"];
  removeEventListener: Document["removeEventListener"];
}

const getDocument = (): FullscreenCapableDocument | null =>
  typeof document === "undefined" ? null : (document as unknown as FullscreenCapableDocument);

const matches = (query: string): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : false;

export function isImmersiveSessionDevice(): boolean {
  if (typeof window === "undefined" || !window.screen) return false;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  return matches("(pointer: coarse)") && shortSide > 0 && shortSide < PHONE_MAX_SHORT_SIDE;
}

// An installed PWA already runs without browser chrome; requesting
// fullscreen on top of that would only add a system prompt/animation.
export function isStandaloneDisplay(): boolean {
  const navigatorStandalone =
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    navigatorStandalone ||
    matches("(display-mode: standalone)") ||
    matches("(display-mode: fullscreen)")
  );
}

export function getFullscreenElement(): Element | null {
  const doc = getDocument();
  if (!doc) return null;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function canRequestFullscreen(): boolean {
  const doc = getDocument();
  if (!doc) return false;
  const root = doc.documentElement;
  const hasMethod =
    typeof root.requestFullscreen === "function" ||
    typeof root.webkitRequestFullscreen === "function";
  const enabled = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled ?? hasMethod;
  return hasMethod && enabled !== false;
}

// True only while fullscreen exists because requestSessionFullscreen put it
// there; never exits fullscreen some other part of the page (or the user via
// a browser control) entered.
let ownsFullscreen = false;

// Call synchronously from the session's Start/Begin click handler. The
// request itself happens before any await, inside the user activation.
// Resolves true when fullscreen was entered; never rejects.
export function requestSessionFullscreen(): Promise<boolean> {
  const doc = getDocument();
  if (
    !doc ||
    !isImmersiveSessionDevice() ||
    isStandaloneDisplay() ||
    getFullscreenElement() !== null ||
    !canRequestFullscreen()
  ) {
    return Promise.resolve(false);
  }

  // The root element (not a session node) is made fullscreen so portalled
  // dialogs, toasts, and popovers rendered under <body> stay visible.
  const root = doc.documentElement;
  try {
    if (typeof root.requestFullscreen === "function") {
      return root
        .requestFullscreen({ navigationUI: "hide" })
        .then(() => {
          ownsFullscreen = true;
          return true;
        })
        .catch(() => false);
    }
    root.webkitRequestFullscreen?.();
    ownsFullscreen = true;
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

export function exitSessionFullscreen(): void {
  const doc = getDocument();
  const wasOwned = ownsFullscreen;
  ownsFullscreen = false;
  if (!doc || !wasOwned || getFullscreenElement() === null) return;
  try {
    if (typeof doc.exitFullscreen === "function") {
      void doc.exitFullscreen().catch(() => {});
    } else {
      doc.webkitExitFullscreen?.();
    }
  } catch {
    // Already exited by the browser; nothing to restore.
  }
}

// A user-initiated exit (system back, swipe, Esc) just drops ownership. On
// phones the session keeps running in the non-fullscreen immersive layout
// (system back is too easy to hit to also undo the layout); on desktop/tablet
// Esc also collapses the expanded session, matching what the user asked for.
const handleFullscreenChange = () => {
  if (getFullscreenElement() === null) {
    const wasOwned = ownsFullscreen;
    ownsFullscreen = false;
    if (wasOwned && sessionExpanded && !isImmersiveSessionDevice()) {
      collapseSession();
    }
  }
};

// Expanded = immersive layout applied (site chrome hidden, session fills the
// viewport), plus real fullscreen where the browser allows it. Each session
// starts expanded on phones and normal elsewhere (see
// activateImmersiveSession); the header's SessionFullscreenToggle flips it on
// any device. If the Fullscreen API is missing or refuses, the layout alone
// still applies.
let sessionExpanded = false;
const sessionExpandedListeners = new Set<() => void>();

const notifySessionExpanded = () => {
  sessionExpandedListeners.forEach((listener) => listener());
};

export function isSessionExpanded(): boolean {
  return sessionExpanded;
}

export function subscribeSessionExpanded(listener: () => void): () => void {
  sessionExpandedListeners.add(listener);
  return () => {
    sessionExpandedListeners.delete(listener);
  };
}

function collapseSession() {
  sessionExpanded = false;
  const doc = getDocument();
  if (doc && isLayoutApplied) {
    removeImmersiveLayout(doc);
  }
  notifySessionExpanded();
}

function requestRootFullscreen(doc: FullscreenCapableDocument) {
  if (isStandaloneDisplay() || getFullscreenElement() !== null || !canRequestFullscreen()) return;
  const root = doc.documentElement;
  try {
    if (typeof root.requestFullscreen === "function") {
      void root
        .requestFullscreen({ navigationUI: "hide" })
        .then(() => {
          ownsFullscreen = true;
        })
        .catch(() => {});
    } else {
      root.webkitRequestFullscreen?.();
      ownsFullscreen = true;
    }
  } catch {
    // Layout-only expanded mode.
  }
}

// Call synchronously from the toggle's click (fullscreen needs the user
// activation). Requires a mounted session frame, which the toggle always has.
export function toggleSessionExpanded(): void {
  const doc = getDocument();
  if (!doc || activeSessionCount === 0) return;

  if (sessionExpanded) {
    // Clears ownership first, so the resulting fullscreenchange doesn't
    // collapse a second time.
    exitSessionFullscreen();
    collapseSession();
    return;
  }

  sessionExpanded = true;
  if (!isLayoutApplied) applyImmersiveLayout(doc);
  notifySessionExpanded();
  requestRootFullscreen(doc);
}

const VIEWPORT_FIT_COVER = "viewport-fit=cover";
export const IMMERSIVE_MEASURED_CLASS = "immersive-session--measured";
const VIEWPORT_HEIGHT_VAR = "--immersive-viewport-height";
const VIEWPORT_TOP_VAR = "--immersive-viewport-top";

let viewportFrame: number | null = null;
// Set only by a viewport *resize* (keyboard opening/closing), so panning or
// scrolling never triggers an extra scroll-into-view.
let revealFocusOnSync = false;

// Mirrors the visual viewport into CSS vars, at most once per animation frame
// (resize/scroll fire in bursts while the keyboard animates), and only writes
// styles: no layout reads beyond the visualViewport numbers themselves.
function scheduleViewportSync() {
  if (viewportFrame !== null || typeof window === "undefined") return;
  viewportFrame = window.requestAnimationFrame(() => {
    viewportFrame = null;
    const doc = getDocument();
    const viewport = window.visualViewport;
    if (!doc || !viewport || !isLayoutApplied) return;
    const root = doc.documentElement;
    root.style.setProperty(VIEWPORT_HEIGHT_VAR, `${Math.round(viewport.height)}px`);
    root.style.setProperty(VIEWPORT_TOP_VAR, `${Math.round(viewport.offsetTop)}px`);
    root.classList.add(IMMERSIVE_MEASURED_CLASS);
    // After the shell shrinks for the keyboard, keep the field being typed
    // into visible inside the session scroller.
    const shouldReveal = revealFocusOnSync;
    revealFocusOnSync = false;
    const focused = doc.activeElement as HTMLElement | null | undefined;
    if (
      shouldReveal &&
      focused &&
      typeof focused.scrollIntoView === "function" &&
      typeof focused.matches === "function" &&
      focused.matches("input, textarea, [contenteditable='true']") &&
      typeof focused.closest === "function" &&
      focused.closest(".immersive-session-frame")
    ) {
      focused.scrollIntoView({ block: "nearest" });
    }
  });
}

function handleViewportResize() {
  revealFocusOnSync = true;
  scheduleViewportSync();
}

function startViewportTracking() {
  if (typeof window === "undefined" || !window.visualViewport) return;
  window.visualViewport.addEventListener("resize", handleViewportResize);
  window.visualViewport.addEventListener("scroll", scheduleViewportSync);
  scheduleViewportSync();
}

function stopViewportTracking(doc: FullscreenCapableDocument) {
  if (typeof window !== "undefined" && window.visualViewport) {
    window.visualViewport.removeEventListener("resize", handleViewportResize);
    window.visualViewport.removeEventListener("scroll", scheduleViewportSync);
  }
  if (viewportFrame !== null && typeof window !== "undefined") {
    window.cancelAnimationFrame(viewportFrame);
  }
  viewportFrame = null;
  revealFocusOnSync = false;
  doc.documentElement.classList.remove(IMMERSIVE_MEASURED_CLASS);
  doc.documentElement.style.removeProperty(VIEWPORT_HEIGHT_VAR);
  doc.documentElement.style.removeProperty(VIEWPORT_TOP_VAR);
}
let activeSessionCount = 0;
// True from a session's first frame mount until its deferred final release.
let isSessionLive = false;
let isLayoutApplied = false;
let originalViewportContent: string | null = null;

function applyImmersiveLayout(doc: FullscreenCapableDocument) {
  isLayoutApplied = true;
  doc.documentElement.classList.add(IMMERSIVE_SESSION_CLASS);
  const viewport = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport) {
    originalViewportContent = viewport.getAttribute("content");
    if (!originalViewportContent?.includes("viewport-fit")) {
      viewport.setAttribute(
        "content",
        originalViewportContent ? `${originalViewportContent}, ${VIEWPORT_FIT_COVER}` : VIEWPORT_FIT_COVER,
      );
    }
  }
  doc.addEventListener("fullscreenchange", handleFullscreenChange);
  doc.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  doc.addEventListener("fullscreenerror", handleFullscreenChange);
  startViewportTracking();
}

function removeImmersiveLayout(doc: FullscreenCapableDocument) {
  isLayoutApplied = false;
  doc.documentElement.classList.remove(IMMERSIVE_SESSION_CLASS);
  const viewport = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport && originalViewportContent !== null) {
    viewport.setAttribute("content", originalViewportContent);
  }
  originalViewportContent = null;
  doc.removeEventListener("fullscreenchange", handleFullscreenChange);
  doc.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
  doc.removeEventListener("fullscreenerror", handleFullscreenChange);
  stopViewportTracking(doc);
}

// Called by each mounted session frame; returns its release function.
// Fullscreen is exited only once the last frame is gone (after the deferred
// check), never on an exercise transition inside a session.
export function activateImmersiveSession(): () => void {
  activeSessionCount += 1;
  const doc = getDocument();
  // Device default only when a new session begins; a frame swap inside the
  // deferred release window keeps whatever the user toggled to.
  if (!isSessionLive) {
    isSessionLive = true;
    sessionExpanded = isImmersiveSessionDevice();
    if (doc && sessionExpanded && !isLayoutApplied) {
      applyImmersiveLayout(doc);
    }
    notifySessionExpanded();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeSessionCount = Math.max(0, activeSessionCount - 1);
    setTimeout(() => {
      if (activeSessionCount > 0) return;
      exitSessionFullscreen();
      const currentDoc = getDocument();
      if (currentDoc && isLayoutApplied) {
        removeImmersiveLayout(currentDoc);
      }
      isSessionLive = false;
      if (sessionExpanded) {
        sessionExpanded = false;
        notifySessionExpanded();
      }
    }, 0);
  };
}

// Test-only: whether fullscreen is currently attributed to a session.
export function isSessionFullscreenOwned(): boolean {
  return ownsFullscreen;
}
