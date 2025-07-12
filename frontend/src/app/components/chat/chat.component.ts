import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { WebSocketService } from '../../services/websocket.service';
import { AuthService } from '../../services/auth.service';
import { MessageService } from '../../services/message.service';
import { MessageComponent } from '../message/message.component';
import { UserListComponent } from '../user-list/user-list.component';
import { Message, User } from '../../models/message.model';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MessageComponent, UserListComponent],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageContainer') private messageContainer!: ElementRef;
  
  messages = signal<Message[]>([]);
  activeUsers = signal<User[]>([]);
  typingUsers = signal<Map<string, boolean>>(new Map());
  currentUser: any;
  messageInput = '';
  isConnected = signal(false);
  showScrollButton = signal(false);
  unreadCount = signal(0);
  showEmojiPicker = signal(false);
  soundEnabled = signal(true);
  
  private subscriptions: Subscription[] = [];
  private typingTimeout: any;
  private lastScrollTop = 0;
  private autoScroll = true;
  private notification?: Notification;

  // Common emojis for quick access
  emojis = ['😀', '😂', '😍', '🤔', '👍', '👎', '❤️', '🔥', '🎉', '✨', '💯', '🚀'];

  typingUsersList = computed(() => {
    const typing: string[] = [];
    this.typingUsers().forEach((isTyping, userId) => {
      if (isTyping) {
        const user = this.activeUsers().find(u => u.userId === userId);
        if (user) {
          typing.push(user.username);
        }
      }
    });
    return typing;
  });

  constructor(
    private wsService: WebSocketService,
    private authService: AuthService,
    private messageService: MessageService
  ) { }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    
    // Request notification permission
    this.requestNotificationPermission();
    
    // Load previous messages
    this.messageService.getMessages().subscribe(
      messages => this.messages.set(messages)
    );

    // Connect to WebSocket
    this.wsService.connect();

    // Subscribe to WebSocket messages
    const wsSub = this.wsService.messages$.subscribe(data => {
      this.handleWebSocketMessage(data);
    });

    // Subscribe to connection status
    const connSub = this.wsService.connection$.subscribe(connected => {
      this.isConnected.set(connected);
      if (connected) {
        // Authenticate with WebSocket
        this.wsService.send({
          type: 'auth',
          userId: this.currentUser.userId,
          username: this.currentUser.username
        });
      }
    });

    this.subscriptions.push(wsSub, connSub);
    
    // Load sound preference from localStorage
    const soundPref = localStorage.getItem('chatSoundEnabled');
    if (soundPref !== null) {
      this.soundEnabled.set(soundPref === 'true');
    }
  }

  ngAfterViewChecked(): void {
    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.wsService.disconnect();
    this.notification?.close();
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    this.unreadCount.set(0);
    document.title = 'Chat Room';
  }

  @HostListener('window:blur')
  onWindowBlur(): void {
    // Window lost focus, enable notifications
  }

  sendMessage(): void {
    if (this.messageInput.trim() && this.isConnected()) {
      this.wsService.send({
        type: 'message',
        content: this.messageInput.trim()
      });
      this.messageInput = '';
      this.showEmojiPicker.set(false);
    }
  }

  onTyping(): void {
    if (!this.isConnected()) return;

    // Send typing indicator
    this.wsService.send({
      type: 'typing',
      isTyping: true
    });

    // Clear previous timeout
    clearTimeout(this.typingTimeout);

    // Set timeout to stop typing indicator
    this.typingTimeout = setTimeout(() => {
      this.wsService.send({
        type: 'typing',
        isTyping: false
      });
    }, 1000);
  }

  onScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const atBottom = element.scrollHeight - element.scrollTop === element.clientHeight;
    const scrollingUp = element.scrollTop < this.lastScrollTop;
    
    this.lastScrollTop = element.scrollTop;
    this.autoScroll = atBottom;
    
    // Show scroll button when scrolled up more than 100px from bottom
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    this.showScrollButton.set(distanceFromBottom > 100);
  }

  scrollToBottom(): void {
    try {
      this.messageContainer.nativeElement.scrollTop = 
        this.messageContainer.nativeElement.scrollHeight;
      this.autoScroll = true;
      this.showScrollButton.set(false);
    } catch(err) { }
  }

  toggleEmojiPicker(): void {
    this.showEmojiPicker.update(show => !show);
  }

  addEmoji(emoji: string): void {
    this.messageInput += emoji;
    this.showEmojiPicker.set(false);
  }

  toggleSound(): void {
    this.soundEnabled.update(enabled => !enabled);
    localStorage.setItem('chatSoundEnabled', String(this.soundEnabled()));
  }

  logout(): void {
    this.authService.logout();
  }

  private handleWebSocketMessage(data: any): void {
    switch (data.type) {
      case 'auth_success':
        console.log('Authenticated successfully');
        break;
        
      case 'message':
        const newMessage = data.data;
        this.messages.update(msgs => [...msgs, newMessage]);
        
        // Play sound if enabled and not from current user
        if (this.soundEnabled() && newMessage.userId !== this.currentUser.userId) {
          this.playNotificationSound();
        }
        
        // Show notification if window is not focused
        if (!document.hasFocus() && newMessage.userId !== this.currentUser.userId) {
          this.showNotification(newMessage);
          this.unreadCount.update(count => count + 1);
          document.title = `(${this.unreadCount()}) Chat Room`;
        }
        break;
        
      case 'active_users':
        this.activeUsers.set(data.users.filter((user: User) => 
          user.userId !== this.currentUser.userId
        ));
        break;
        
      case 'user_joined':
        if (data.userId !== this.currentUser.userId) {
          this.activeUsers.update(users => [...users, { userId: data.userId, username: data.username }]);
          if (this.soundEnabled()) {
            this.playJoinSound();
          }
        }
        break;
        
      case 'user_left':
        this.activeUsers.update(users => 
          users.filter(user => user.userId !== data.userId)
        );
        this.typingUsers.update(users => {
          const newMap = new Map(users);
          newMap.delete(data.userId);
          return newMap;
        });
        break;
        
      case 'typing':
        if (data.userId !== this.currentUser.userId) {
          this.typingUsers.update(users => {
            const newMap = new Map(users);
            newMap.set(data.userId, data.isTyping);
            return newMap;
          });
        }
        break;
    }
  }

  private requestNotificationPermission(): void {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  private showNotification(message: Message): void {
    if ('Notification' in window && Notification.permission === 'granted') {
      this.notification?.close();
      this.notification = new Notification(`New message from ${message.username}`, {
        body: message.content,
        icon: '/favicon.ico',
        tag: 'chat-notification',
        requireInteraction: false
      });
      
      this.notification.onclick = () => {
        window.focus();
        this.notification?.close();
      };
      
      // Auto close after 5 seconds
      setTimeout(() => this.notification?.close(), 5000);
    }
  }

  private playNotificationSound(): void {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAhycAAIenAAABAAgAZGF0YQoGAACBhYqFjF');
    audio.volume = 0.5;
    audio.play().catch(() => {}); // Ignore errors
  }

  private playJoinSound(): void {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAhycAAIceAAABAAgAZGF0YQoGAACBhYqFjE');
    audio.volume = 0.3;
    audio.play().catch(() => {}); // Ignore errors
  }

  getTypingUsers(): string[] {
    return this.typingUsersList();
  }
}