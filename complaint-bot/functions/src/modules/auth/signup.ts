import { admin, db } from '../../config/firebase';

export class SignupService {
  async signup(userData: {
    email: string;
    password: string;
    name: string;
    phone: string;
  }): Promise<{ success: boolean; userId: string }> {
    try {
      console.log('Starting signup process for:', userData.email);

      // Validate input data
      if (!this.validateEmail(userData.email)) {
        throw new Error('Invalid email format');
  }

      if (!this.validatePhone(userData.phone)) {
        throw new Error('Invalid phone number format');
      }

      // Check if email already exists
      if (await this.isEmailRegistered(userData.email)) {
        throw new Error('Email is already registered');
  }

      // Check if phone already exists
      if (await this.isPhoneRegistered(userData.phone)) {
        throw new Error('Phone number is already registered');
      }

      // Create user in Firebase Auth using Admin SDK
      const userRecord = await admin.auth().createUser({
        email: userData.email,
        password: userData.password,
        displayName: userData.name,
        phoneNumber: userData.phone
      });

      console.log('User created in Firebase Auth:', userRecord.uid);

      // Create user profile in Firestore
      await db.collection('users').doc(userRecord.uid).set({
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log('User profile created in Firestore');

      return { success: true, userId: userRecord.uid };
    } catch (error: any) {
      console.error('Error during signup:', error.message);
      throw error;
    }
  }

  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private validatePhone(phone: string): boolean {
    // Remove any extra plus signs and spaces
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^\+{2,}/, '+');
    // Basic international format validation
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(cleanPhone);
  }

  async isEmailRegistered(email: string): Promise<boolean> {
    try {
      await admin.auth().getUserByEmail(email);
      return true;
    } catch (error) {
      return false;
    }
  }

  async isPhoneRegistered(phone: string): Promise<boolean> {
    try {
      await admin.auth().getUserByPhoneNumber(phone);
      return true;
    } catch (error) {
      return false;
    }
  }
} 
