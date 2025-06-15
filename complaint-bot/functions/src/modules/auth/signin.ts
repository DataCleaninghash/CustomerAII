import * as admin from 'firebase-admin';
import { db } from '../../config/firebase';

class SigninService {
  private auth: admin.auth.Auth;

  constructor() {
    // Use the already initialized Firebase instance
    this.auth = admin.auth();
  }

  /**
   * Sign in a user with email/phone and password
   * @param identifier Email or phone
   * @param password Password
   * @returns Firebase ID token if successful
   */
  async signin(identifier: string, password: string): Promise<{ success: boolean; idToken?: string; error?: string }> {
    try {
      const apiKey = process.env.FIREBASE_API_KEY;
      if (!apiKey) throw new Error('FIREBASE_API_KEY not set');
      let email = identifier;
      if (identifier.startsWith('+')) {
        // Find user by phone
        let userRecord;
        try {
          userRecord = await this.auth.getUserByPhoneNumber(identifier);
        } catch (err) {
          return { success: false, error: 'Phone number not found or not registered.' };
        }
        if (!userRecord.email) {
          return { success: false, error: 'No email associated with this phone number.' };
        }
        email = userRecord.email;
      }
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      });
      const data: { idToken?: string; error?: { message?: string } } = await response.json();
      if (data.idToken) {
        return { success: true, idToken: data.idToken };
      } else {
        return { success: false, error: data.error?.message || 'Sign-in failed' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error during sign-in' };
    }
  }
}

export default SigninService; 