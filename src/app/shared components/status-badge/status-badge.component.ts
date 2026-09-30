import { NgClass } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { TranslationService } from '../../core/i18n/translation.service';

@Component({
  selector: 'app-status-badge',
  imports: [NgClass],
  templateUrl: './status-badge.component.html',
  styleUrls: ['./status-badge.component.css']
})
export class StatusBadgeComponent {
  @Input() status: 'open' | 'in_progress' | 'resolved' | 'closed' = 'open';

  get cssClass() { return `status-${this.status}`; }
  private i18n = inject(TranslationService);
  get label() {
    return this.i18n.t('status.' + this.status);
  }
}