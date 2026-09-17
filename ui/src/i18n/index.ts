import { useEffect, useState } from 'react';
import type { SupportedLocale } from '../lib/types';
import enUS from './locales/en-US.json';
import es from './locales/es.json';
import ptBR from './locales/pt-BR.json';

export interface LocaleInfo {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'en-US', name: 'English (US)', nativeName: 'English (US)', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
];

const LOCALES_DATA: Record<SupportedLocale, Record<string, unknown>> = {
  'pt-BR': ptBR as Record<string, unknown>,
  'en-US': enUS as Record<string, unknown>,
  es: es as Record<string, unknown>,
};

const LANGUAGE_KEY = 'Gitma:language';
const listeners = new Set<(lang: SupportedLocale) => void>();

export function getLanguage(): SupportedLocale {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (saved && (saved === 'pt-BR' || saved === 'en-US' || saved === 'es')) {
      return saved as SupportedLocale;
    }
    // Auto-detect browser language if possible
    if (typeof navigator !== 'undefined' && navigator.language) {
      const navLang = navigator.language.toLowerCase();
      if (navLang.startsWith('en')) return 'en-US';
      if (navLang.startsWith('es')) return 'es';
      if (navLang.startsWith('pt')) return 'pt-BR';
    }
    return 'pt-BR';
  } catch {
    return 'pt-BR';
  }
}

let currentLanguage: SupportedLocale = getLanguage();

export function setLanguage(lang: SupportedLocale): void {
  currentLanguage = lang;
  try {
    localStorage.setItem(LANGUAGE_KEY, lang);
    document.documentElement.setAttribute('lang', lang);
  } catch {}
  listeners.forEach((fn) => fn(lang));
}

function resolveNestedKey(obj: unknown, keyPath: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const parts = keyPath.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return typeof current === 'string' ? current : null;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const activeDict = LOCALES_DATA[currentLanguage] ?? LOCALES_DATA['pt-BR'];
  const fallbackDict = LOCALES_DATA['pt-BR'];

  let text = resolveNestedKey(activeDict, key) ?? resolveNestedKey(fallbackDict, key) ?? key;

  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    });
  }

  return text;
}

export function useI18n() {
  const [lang, setLangState] = useState<SupportedLocale>(currentLanguage);

  useEffect(() => {
    const listener = (newLang: SupportedLocale) => {
      setLangState(newLang);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const changeLanguage = (newLang: SupportedLocale) => {
    setLanguage(newLang);
  };

  return {
    t,
    language: lang,
    setLanguage: changeLanguage,
    supportedLocales: SUPPORTED_LOCALES,
  };
}
