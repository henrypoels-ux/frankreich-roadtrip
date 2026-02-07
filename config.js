/**
 * Konfiguration für "Auto-Load" (ohne Login/ohne Tippen auf dem Handy)
 * - SUPABASE_URL: Project URL (Settings → API)
 * - SUPABASE_ANON_KEY: "Publishable key" (Settings → API Keys → sb_publishable_...)
 * - TRIP_SLUG: deine Trip-ID (z.B. frankreich-2026)
 */
window.APP_CONFIG = {
  SUPABASE_URL: "PASTE_SUPABASE_URL_HERE",
  SUPABASE_ANON_KEY: "PASTE_SB_PUBLISHABLE_KEY_HERE",
  TRIP_SLUG: "frankreich-2026",
  AUTOLOAD_PUBLIC: true
};