import { Component, OnInit, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { FormsModule } from '@angular/forms';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-login',
    imports: [FormsModule, NgIf],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent  {

   email = '';
  password = '';
  showPassword = false;
  loading = signal(false);
  error = signal('');

  constructor(private auth: AuthService) {}

  async onLogin() {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.email, this.password);
    } catch (err: any) {
      this.error.set(err.message ?? 'Login failed. Please check your credentials.');
    } finally {
      this.loading.set(false);
    }
  }
}
