import { Component, inject } from '@angular/core';
import { TranslationService } from '../../core/i18n/translation.service';

/** Floating language button — always visible, bottom corner (flips with the page direction). */
@Component({
  selector: 'app-lang-switcher',
  standalone: true,
  template: `
    <button type="button" class="lang-fab"
            (click)="i18n.toggle()"
            [attr.aria-label]="i18n.lang() === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'"
            [title]="i18n.lang() === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'">
      <i class="bi bi-translate"></i>
      <span class="lang-fab-label" [attr.lang]="i18n.lang() === 'ar' ? 'en' : 'ar'">
        {{ i18n.lang() === 'ar' ? 'English' : 'العربية' }}
      </span>
    </button>
  `,
  styles: [`
    .lang-fab {
      position: fixed;
      bottom: 22px;
      inset-inline-end: 22px;
      z-index: 1040;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 18px 0 16px;
      border: 1px solid var(--border, #e4e6ef);
      border-radius: 999px;
      background: var(--surface, #fff);
      color: var(--accent, #4f46e5);
      font: 600 0.9rem var(--font, sans-serif);
      box-shadow: 0 6px 20px rgba(17, 24, 39, 0.12), 0 2px 6px rgba(17, 24, 39, 0.06);
      cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
    }
    .lang-fab:hover {
      transform: translateY(-2px);
      background: var(--accent-light, #eef2ff);
      box-shadow: 0 10px 26px rgba(79, 70, 229, 0.18);
    }
    .lang-fab:focus-visible { outline: 3px solid var(--accent-mid, #c7d2fe); outline-offset: 2px; }
    .lang-fab i { font-size: 1.05rem; }
    .lang-fab-label[lang="ar"] { font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif; font-size: 0.95rem; }
    @media print { .lang-fab { display: none; } }
  `],
})
export class LangSwitcherComponent {
  i18n = inject(TranslationService);
}