export interface UserSignupData {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResponse {
  success: boolean;
  userId?: string;
  error?: string;
}

export interface SignupResult {
  success: boolean;
  userId?: string;
  error?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
} 