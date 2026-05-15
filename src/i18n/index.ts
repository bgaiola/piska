/**
 * I18n — tiny translation runtime for PISKA.
 *
 * Lookup precedence: current locale → 'pt-BR' (source of truth) → key itself.
 * Param substitution uses `{{name}}` placeholders.
 *
 * Persistence: the chosen locale is stored under `piska.locale`. Detection
 * falls back to `navigator.language` mapping (`pt*` → pt-BR, `es*` → es-ES,
 * else en). Listeners are invoked on every `setLocale` call so scenes can
 * redraw their text without re-creating themselves.
 */

export type Locale = 'pt-BR' | 'es-ES' | 'en';

export const SUPPORTED_LOCALES: Locale[] = ['pt-BR', 'es-ES', 'en'];

export interface TranslationDict {
  [key: string]: string;
}

const STORAGE_KEY = 'piska.locale';

function isLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.indexOf(value as Locale) >= 0;
}

function detectFromNavigator(): Locale {
  if (typeof navigator === 'undefined') return 'pt-BR';
  const lang = (navigator.language ?? 'pt-BR').toLowerCase();
  if (lang.startsWith('pt')) return 'pt-BR';
  if (lang.startsWith('es')) return 'es-ES';
  return 'en';
}

function readStored(): Locale | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && isLocale(raw)) return raw;
    return null;
  } catch {
    return null;
  }
}

function writeStored(loc: Locale): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, loc);
  } catch {
    // Private mode or quota — ignore, runtime state still works.
  }
}

class I18n {
  private current: Locale = 'pt-BR';
  private dicts: Partial<Record<Locale, TranslationDict>> = {};
  private listeners: Array<(loc: Locale) => void> = [];

  init(): void {
    const stored = readStored();
    if (stored !== null) {
      this.current = stored;
      return;
    }
    this.current = detectFromNavigator();
  }

  setLocale(loc: Locale): void {
    if (this.current === loc) return;
    this.current = loc;
    writeStored(loc);
    for (const fn of this.listeners.slice()) {
      try {
        fn(loc);
      } catch {
        // Bad listener shouldn't break others.
      }
    }
  }

  getLocale(): Locale {
    return this.current;
  }

  register(loc: Locale, dict: TranslationDict): void {
    this.dicts[loc] = dict;
  }

  t(key: string, params?: Record<string, string | number>): string {
    const cur = this.dicts[this.current];
    const fallback = this.dicts['pt-BR'];
    let raw: string | undefined;
    if (cur && Object.prototype.hasOwnProperty.call(cur, key)) {
      raw = cur[key];
    } else if (fallback && Object.prototype.hasOwnProperty.call(fallback, key)) {
      raw = fallback[key];
    } else {
      raw = key;
    }
    if (params === undefined) return raw;
    return raw.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
      const v = params[name];
      return v === undefined ? `{{${name}}}` : String(v);
    });
  }

  onChange(fn: (loc: Locale) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }
}

export const i18n = new I18n();
export const t = (key: string, params?: Record<string, string | number>): string =>
  i18n.t(key, params);
