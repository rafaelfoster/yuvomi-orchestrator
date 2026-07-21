// Locale codes mirror exactly what Yuvomi itself ships (public/i18n.js's
// SUPPORTED_LOCALES) so the admin console and every family's own instance
// offer the same language set. Unlike Yuvomi (default 'de'), English is
// the default here.
export interface LanguageOption {
  code: string;
  nativeName: string;
  rtl?: boolean;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "en", nativeName: "English" },
  { code: "de", nativeName: "Deutsch" },
  { code: "es", nativeName: "Español" },
  { code: "fr", nativeName: "Français" },
  { code: "it", nativeName: "Italiano" },
  { code: "pt", nativeName: "Português" },
  { code: "nl", nativeName: "Nederlands" },
  { code: "sv", nativeName: "Svenska" },
  { code: "pl", nativeName: "Polski" },
  { code: "cs", nativeName: "Čeština" },
  { code: "hu", nativeName: "Magyar" },
  { code: "el", nativeName: "Ελληνικά" },
  { code: "ru", nativeName: "Русский" },
  { code: "uk", nativeName: "Українська" },
  { code: "tr", nativeName: "Türkçe" },
  { code: "ar", nativeName: "العربية", rtl: true },
  { code: "fa", nativeName: "فارسی", rtl: true },
  { code: "hi", nativeName: "हिन्दी" },
  { code: "vi", nativeName: "Tiếng Việt" },
  { code: "id", nativeName: "Bahasa Indonesia" },
  { code: "zh", nativeName: "中文" },
  { code: "ja", nativeName: "日本語" },
  { code: "ko", nativeName: "한국어" },
];

export const DEFAULT_LANGUAGE = "en";
export const RTL_LANGUAGES = new Set(LANGUAGES.filter((l) => l.rtl).map((l) => l.code));
