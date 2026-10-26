import { useEffect, type ReactNode } from "react";
import { activateImmersiveSession } from "../../utils/immersiveSession";
import "./styles/immersive-session.scss";

// Wraps a running learning session (Custom Practice, Study New Words, Review
// Words). On phones it marks the document as an immersive session, which
// hides site chrome and gives the session the full dynamic viewport with
// safe-area padding (see styles/immersive-session.scss). Everywhere else it
// is layout-transparent (display: contents), so desktop/tablet layouts are
// unchanged. Fullscreen itself is requested by the Start/Begin click handlers
// via requestSessionFullscreen(), not here: an effect has no user activation.
export function ImmersiveSessionFrame({ children }: { children: ReactNode }) {
  useEffect(() => activateImmersiveSession(), []);

  return <div className="immersive-session-frame">{children}</div>;
}
