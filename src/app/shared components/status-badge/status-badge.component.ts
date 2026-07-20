import { NgClass } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  imports: [NgClass],
  templateUrl: './status-badge.component.html',
  styleUrls: ['./status-badge.component.css']
})
export class StatusBadgeComponent {
  @Input() status: 'open' | 'in_progress' | 'resolved' | 'closed' = 'open';

  get cssClass() { return `status-${this.status}`; }
  get label() {
    return { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' }[this.status];
  }
}