import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '@/services/api';

interface User {
  id: string;
  email: string;
  phone?: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  login: (identifier: string, password: string) => Promise<void>;
  register: (email: string, password: string, phone: string, name: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (identifier: string, password: string) => {
    setLoading(true);
    try {
      // Call backend login API (returns { idToken, userId })
      const response = await apiService.login(identifier, password);
      // Fetch user profile from backend
      const userProfile = await apiService.getUserProfile(response.userId);
      setUser(userProfile);
      localStorage.setItem('user', JSON.stringify(userProfile));
    } catch (error) {
      throw new Error('Login failed');
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, phone: string, name: string) => {
    setLoading(true);
    try {
      // Call backend API for registration
      const response = await apiService.register({ email, password, phone, name });
      // Fetch user profile from backend
      const userProfile = await apiService.getUserProfile(response.userId);
      setUser(userProfile);
      localStorage.setItem('user', JSON.stringify(userProfile));
    } catch (error: unknown) {
      let message = 'Registration failed';
      if (error instanceof Error) message = error.message;
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
