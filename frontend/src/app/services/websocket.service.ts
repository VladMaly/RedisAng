import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private socket!: WebSocket;
  private messagesSubject = new Subject<any>();
  public messages$ = this.messagesSubject.asObservable();
  private connectionSubject = new Subject<boolean>();
  public connection$ = this.connectionSubject.asObservable();

  constructor() { }

  connect(): void {
    const wsUrl = 'ws://localhost:3000';
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('WebSocket connected');
      this.connectionSubject.next(true);
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.messagesSubject.next(data);
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.socket.onclose = () => {
      console.log('WebSocket disconnected');
      this.connectionSubject.next(false);
      // Attempt to reconnect after 3 seconds
      setTimeout(() => this.connect(), 3000);
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
    }
  }

  send(data: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  isConnected(): boolean {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }
}