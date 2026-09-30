import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';

import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { TranslationService } from './core/i18n/translation.service';

// Arabic month / day names for dates
registerLocaleData(localeAr, 'ar');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Restore the Supabase session BEFORE the router runs the guards,
    // so a page refresh or a direct link keeps the user on the same page.
    // Apply the saved language (dir + Bootstrap RTL) before the first screen renders
    provideAppInitializer(() => { inject(TranslationService); }),
    provideAppInitializer(() => inject(AuthService).init()),
    provideRouter(routes),
  ],
};