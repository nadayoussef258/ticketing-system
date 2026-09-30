import { Component, OnInit, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';
import { TranslatePipe } from '../../../core/i18n/t.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';

@Component({
  selector: 'app-login',
    imports: [FormsModule, NgIf, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent  {

   email = '';
  password = '';
  showPassword = false;
  loading = signal(false);
  error = signal('');

  constructor(private auth: AuthService, private i18n: TranslationService) {}

  async onLogin() {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.email, this.password);
    } catch (err: any) {
      this.error.set(
        err?.message === 'Invalid login credentials'
          ? this.i18n.t('login.invalid')
          : (err?.message ?? this.i18n.t('login.failed'))
      );
    } finally {
      this.loading.set(false);
    }
  }
}