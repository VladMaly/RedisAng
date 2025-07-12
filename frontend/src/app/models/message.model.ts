export interface Message {
  id: string;
  userId: string;
  username: string;
  content: string;
  timestamp: string;
}

export interface User {
  userId: string;
  username: string;
  isTyping?: boolean;
}