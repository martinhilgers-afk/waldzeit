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

  return {
    id: user.id,
    email: user.email,
    firstName: String(firstName || "Unbekannt"),
  };
}