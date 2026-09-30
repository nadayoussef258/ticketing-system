import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from './translation.service';

/**
 * {{ 'nav.tickets' | t }}
 * {{ 'dashboard.count' | t: { n: 3 } }}
 * Impure on purpose: re-evaluates when the language changes.
 */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private i18n = inject(TranslationService);
  transform(key: string, params?: Record<string, string | number | null | undefined>): string {
    return this.i18n.t(key, params);
  }
}

/** {{ ticket.created_at | tdate: 'medium' }} — language-aware date. */
@Pipe({ name: 'tdate', pure: false })
export class TranslateDatePipe implements PipeTransform {
  private i18n = inject(TranslationService);
  transform(value: string | number | Date | null | undefined,
            format: 'short' | 'medium' | 'monthYear' | 'time' | 'full' = 'medium'): string {
    return this.i18n.date(value, format);
  }
}