import * as admin from 'firebase-admin';

interface User {
  id: string;
  email?: string;
  role: string;
}

export async function verifyToken(token: string): Promise<User | null> {
  try {
    if (!admin.apps.length) {
      admin.initializeApp();
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    
    return {
      id: decodedToken.uid,
      email: decodedToken.email,
      role: decodedToken.role || 'user'
    };
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
} 