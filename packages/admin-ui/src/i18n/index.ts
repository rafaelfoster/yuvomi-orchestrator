import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { DEFAULT_LANGUAGE, LANGUAGES, RTL_LANGUAGES } from "./languages";

import en from "./locales/en.json";
import de from "./locales/de.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import it from "./locales/it.json";
import pt from "./locales/pt.json";
import nl from "./locales/nl.json";
import sv from "./locales/sv.json";
import pl from "./locales/pl.json";
import cs from "./locales/cs.json";
import hu from "./locales/hu.json";
import el from "./locales/el.json";
import ru from "./locales/ru.json";
import uk from "./locales/uk.json";
import tr from "./locales/tr.json";
import ar from "./locales/ar.json";
import fa from "./locales/fa.json";
import hi from "./locales/hi.json";
import vi from "./locales/vi.json";
import id from "./locales/id.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";

const resources = {
  en: { translation: en },
  de: { translation: de },
  es: { translation: es },
  fr: { translation: fr },
  it: { translation: it },
  pt: { translation: pt },
  nl: { translation: nl },
  sv: { translation: sv },
  pl: { translation: pl },
  cs: { translation: cs },
  hu: { translation: hu },
  el: { translation: el },
  ru: { translation: ru },
  uk: { translation: uk },
  tr: { translation: tr },
  ar: { translation: ar },
  fa: { translation: fa },
  hi: { translation: hi },
  vi: { translation: vi },
  id: { translation: id },
  zh: { translation: zh },
  ja: { translation: ja },
  ko: { translation: ko },
};

const STORAGE_KEY = "yuvomi-orchestrator-locale";

function applyDocumentDirection(lng: string): void {
  const base = lng.split("-")[0];
  document.documentElement.lang = base;
  document.documentElement.dir = RTL_LANGUAGES.has(base) ? "rtl" : "ltr";
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: LANGUAGES.map((l) => l.code),
    nonExplicitSupportedLngs: true,
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: STORAGE_KEY,
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  });

applyDocumentDirection(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE);
i18n.on("languageChanged", applyDocumentDirection);

export { i18n };
