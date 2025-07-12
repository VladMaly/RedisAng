import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUser = signal<any>(null);

  constructor(private router: Router) {
    // Check if user is stored in session storage
    const storedUser = sessionStorage.getItem('currentUser');
    if (storedUser) {
      this.currentUser.set(JSON.parse(storedUser));
    }
  }

  login(username: string): void {
    const user = {
      userId: this.generateUserId(),
      username: username
    };
    
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    this.currentUser.set(user);
    this.router.navigate(['/chat']);
  }

  logout(): void {
    sessionStorage.removeItem('currentUser');
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  getCurrentUser() {
    return this.currentUser();
  }

  isAuthenticated(): boolean {
    return !!this.currentUser();
  }

  private generateUserId(): string {
    return 'user_' + Math.random().toString(36).substr(2, 9);
  }
}