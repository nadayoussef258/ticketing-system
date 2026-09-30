import { NgClass } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { TranslationService } from '../../core/i18n/translation.service';

@Component({
  selector: 'app-priority-badge',
    imports: [NgClass],
  templateUrl: './priority-badge.component.html',
  styleUrls: ['./priority-badge.component.css']
})
export class PriorityBadgeComponent {
  @Input() priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';

  get cssClass() { return `priority-${this.priority}`; }
  private i18n = inject(TranslationService);
  get label() {
    return this.i18n.t('priority.' + this.priority);
  }
  get icon() {
    return {
      low: 'bi-arrow-down-circle',
      medium: 'bi-dash-circle',
      high: 'bi-arrow-up-circle',
      critical: 'bi-exclamation-triangle-fill',
    }[this.priority];
  }
}