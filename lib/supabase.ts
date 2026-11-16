import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const FALLBACK_SUPABASE_URL = "https://supabase.co";
const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

function isValidSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const isLocalhost =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    const isSecure = url.protocol === "https:";
    const isLocalDevelopment = url.protocol === "http:" && isLocalhost;

    return (
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      (isSecure || isLocalDevelopment)
    );
  } catch {
    return false;
  }
}

const isConfiguredSupabaseUrlValid =
  configuredSupabaseUrl !== undefined && isValidSupabaseUrl(configuredSupabaseUrl);
const supabaseUrl = isConfiguredSupabaseUrlValid
  ? configuredSupabaseUrl
  : FALLBACK_SUPABASE_URL;

export const supabaseConfigured = Boolean(isConfiguredSupabaseUrlValid && supabaseAnonKey);

export const supabase =
  isConfiguredSupabaseUrlValid && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey)
    : null;
