import { supabase } from "@/lib/supabase";

export async function getMe() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) return null;

  const meta: any = user.user_metadata || {};
  const firstName =
    meta.first_name ||
    meta.vorname ||
    (meta.full_name ? String(meta.full_name).split(" ")[0] : null) ||
    user.email;

  // ✅ NEW: Standard-Maschine aus user_settings laden
  const { data: settings, error: settingsErr } = await supabase
    .from("user_settings")
    .select("default_machine")
    .eq("user_id", user.id)
    .maybeSingle();

  // Wenn es noch keine Zeile gibt oder RLS greift: einfach leer lassen
  const defaultMachine =
    settingsErr ? "" : (settings?.default_machine ?? "");

  return {
    id: user.id,
    email: user.email,
    firstName: String(firstName || "Unbekannt"),

    // ✅ NEW: überall verfügbar
    default_machine: String(defaultMachine || ""),
  };
}