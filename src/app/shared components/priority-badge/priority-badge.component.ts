import { NgClass } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-priority-badge',
    imports: [NgClass],
  templateUrl: './priority-badge.component.html',
  styleUrls: ['./priority-badge.component.css']
})
export class PriorityBadgeComponent {
  @Input() priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';

  get cssClass() { return `priority-${this.priority}`; }
  get label() {
    return { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }[this.priority];
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