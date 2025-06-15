interface User {
  id: string;
  email?: string;
  role: string;
}

export function verifyToken(token: string): Promise<User | null>; 