// Build-time flag distinguishing the public "production" build from Brian's
// personal "full" build. Set via VITE_APP_TIER=full at build time (see the
// package:studio script). Anything else, including unset, is production —
// that way npm run dev and the normal package/release pipeline are
// unaffected unless this is explicitly opted into.
export const isFullTier = import.meta.env.VITE_APP_TIER === 'full';
