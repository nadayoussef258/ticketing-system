import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { Ticket, TicketComment } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { TicketService } from '../../../core/services/ticket.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../../../shared components/navbar/navbar.component';
import { PriorityBadgeComponent } from '../../../shared components/priority-badge/priority-badge.component';
import { StatusBadgeComponent } from '../../../shared components/status-badge/status-badge.component';

@Component({
  selector: 'app-ticket-detail',
  imports: [RouterLink, FormsModule, NgFor, NgIf, DatePipe, NavbarComponent, PriorityBadgeComponent, StatusBadgeComponent],
  templateUrl: './ticket-detail.component.html',
  styleUrls: ['./ticket-detail.component.css']
})
export class PortalTicketDetailComponent implements OnInit, OnDestroy {

  ticket = signal<Ticket | null>(null);
  comments = signal<TicketComment[]>([]);
  loading = signal(true);
  sending = signal(false);
  replyText = '';

  private commentsChannel: any;
  private ticketChannel: any;

  constructor(
    public auth: AuthService,
    private ticketSvc: TicketService,
    private route: ActivatedRoute,
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      const [ticket, comments] = await Promise.all([
        this.ticketSvc.getTicketById(id),
        this.ticketSvc.getComments(id),
      ]);
      this.ticket.set(ticket);
      this.comments.set(comments);

      const currentUserId = this.auth.getCurrentUserId();

      // New comments from IT in real time
      this.commentsChannel = this.ticketSvc.subscribeToComments(id, (comment) => {
        if (comment.author_id !== currentUserId) {
          this.comments.update(c => [...c, comment]);
        }
      });

      // Ticket status/assignment changes in real time
      this.ticketChannel = this.ticketSvc.subscribeToTicketUpdates(id, (updated) => {
        this.ticket.update(t => t ? { ...t, ...updated } : updated);
      });
    } finally {
      this.loading.set(false);
    }
  }

  async sendReply() {
    const user = this.auth.user();
    const ticket = this.ticket();
    if (!user || !ticket || !this.replyText.trim()) return;
    this.sending.set(true);
    try {
      const comment = await this.ticketSvc.addComment(
        ticket.id, this.replyText.trim(), false, user.full_name, user.id
      );
      this.comments.update(c => [...c, comment]);
      this.replyText = '';
    } finally {
      this.sending.set(false);
    }
  }

  ngOnDestroy() {
    this.commentsChannel?.unsubscribe();
    this.ticketChannel?.unsubscribe();
  }
}