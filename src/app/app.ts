import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LangSwitcherComponent } from './shared components/lang-switcher/lang-switcher.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LangSwitcherComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('ticketing-system');
}