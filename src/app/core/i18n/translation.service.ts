import { Injectable, computed, signal } from '@angular/core';
import { formatDate } from '@angular/common';
import { EN, AR, TKey } from './translations';

export type Lang = 'en' | 'ar';

const STORAGE_KEY = 'app.lang';
const BOOTSTRAP_LTR = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
const BOOTSTRAP_RTL = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css';

/** Named date formats, written the natural way for each language. */
const DATE_FORMATS: Record<string, { en: string; ar: string }> = {
  short:     { en: 'MMM d',              ar: 'd MMM' },
  medium:    { en: 'MMM d, y',           ar: 'd MMM y' },
  monthYear: { en: 'MMM y',              ar: 'MMM y' },
  time:      { en: 'MMM d · h:mm a',     ar: 'd MMM · h:mm a' },
  full:      { en: 'MMM d, y · h:mm a',  ar: 'd MMM y · h:mm a' },
};

@Injectable({ providedIn: 'root' })
export class TranslationService {
  private _lang = signal<Lang>(this.initialLang());

  readonly lang  = this._lang.asReadonly();
  readonly isRtl = computed(() => this._lang() === 'ar');

  constructor() {
    this.apply(this._lang());
  }

  setLang(lang: Lang) {
    if (lang === this._lang()) return;
    this._lang.set(lang);
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* private mode */ }
    this.apply(lang);
  }

  toggle() {
    this.setLang(this._lang() === 'ar' ? 'en' : 'ar');
  }

  /** Translate a key. `{name}` placeholders are replaced from params. */
  t(key: TKey | string, params?: Record<string, string | number | null | undefined>): string {
    const dict = this._lang() === 'ar' ? AR : EN;
    let text: string = (dict as Record<string, string>)[key] ?? (EN as Record<string, string>)[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.split(`{${k}}`).join(String(v ?? ''));
      }
    }
    return text;
  }

  /** Format a date with a named format ('short' | 'medium' | 'monthYear' | 'time' | 'full'). */
  date(value: string | number | Date | null | undefined, format: keyof typeof DATE_FORMATS = 'medium'): string {
    if (value === null || value === undefined || value === '') return '';
    const lang = this._lang();
    const pattern = DATE_FORMATS[format]?.[lang] ?? DATE_FORMATS['medium'][lang];
    try {
      return formatDate(value, pattern, lang === 'ar' ? 'ar' : 'en-US');
    } catch {
      return '';
    }
  }

  private initialLang(): Lang {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'ar' || saved === 'en') return saved;
    } catch { /* ignore */ }
    return 'en';
  }

  /** <html lang/dir> + the matching Bootstrap build (LTR / RTL). */
  private apply(lang: Lang) {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';

    const link = document.getElementById('bootstrap-css') as HTMLLinkElement | null;
    if (link) {
      const href = lang === 'ar' ? BOOTSTRAP_RTL : BOOTSTRAP_LTR;
      if (link.href !== href) {
        link.removeAttribute('integrity');   // the SRI hash belongs to the LTR file only
        link.href = href;
      }
    }
    document.title = lang === 'ar' ? 'بوابة الدعم الفني' : 'IT Support Ticketing';
  }
}