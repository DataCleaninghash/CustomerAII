/**
 * NotificationService: Sends updates to users
 */
import { UserNotification } from '../../types/logging';
import loggingConfig from '../../config/logging.config';
import * as admin from 'firebase-admin';
import axios from 'axios';

export class NotificationService {
  private db: FirebaseFirestore.Firestore;

  constructor() {
    // Initialize Firestore if not already initialized
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    this.db = admin.firestore();
  }

  /**
   * Send a notification to a user
   * @param userId ID of the user
   * @param notification Notification to send
   * @returns Success status
   */
  async notifyUser(
    userId: string,
    notification: UserNotification
  ): Promise<boolean> {
    try {
      // Store notification in Firestore
      await this.storeNotification(userId, notification);
      
      // Send through configured channels
      const results = await Promise.all(
        loggingConfig.notificationChannels.map(channel => 
          this.sendThroughChannel(userId, notification, channel)
        )
      );
      
      // Return true if at least one channel succeeded
      return results.some(result => result);
    } catch (error) {
      console.error('Error sending notification:', error);
      return false;
    }
  }

  /**
   * Store notification in Firestore
   * @param userId ID of the user
   * @param notification Notification to store
   */
  private async storeNotification(
    userId: string,
    notification: UserNotification
  ): Promise<void> {
    try {
      // Create a clean notification object without undefined values
      const cleanNotification = {
        type: notification.type,
        title: notification.title,
        message: notification.message,
        requiresAction: notification.requiresAction,
        ...(notification.actionUrl && { actionUrl: notification.actionUrl }),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false
      };

      await this.db.collection(`users/${userId}/notifications`).add(cleanNotification);
    } catch (error) {
      console.error('Error storing notification:', error);
      // Non-critical error, just log it
    }
  }

  /**
   * Send notification through a specific channel
   * @param userId ID of the user
   * @param notification Notification to send
   * @param channel Channel to send through
   * @returns Success status
   */
  private async sendThroughChannel(
    userId: string,
    notification: UserNotification,
    channel: 'email' | 'sms' | 'push'
  ): Promise<boolean> {
    try {
      // Get user contact information
      const userContact = await this.getUserContactInfo(userId);
      
      if (!userContact) {
        console.error(`No contact information found for user ${userId}`);
        return false;
      }
      
      switch (channel) {
        case 'email':
          return await this.sendEmail(userContact.email, notification);
        case 'sms':
          return await this.sendSMS(userContact.phone, notification);
        case 'push':
          return await this.sendPushNotification(userContact.deviceToken, notification);
        default:
          return false;
      }
    } catch (error) {
      console.error(`Error sending ${channel} notification:`, error);
      return false;
    }
  }

  /**
   * Send notification via email
   * @param email Email address
   * @param notification Notification to send
   * @returns Success status
   */
  private async sendEmail(
    email: string,
    notification: UserNotification
  ): Promise<boolean> {
    // In a real implementation, this would use a proper email service
    // For this example, we'll simulate sending an email
    
    console.log(`[Simulated] Sending email to ${email}:`);
    console.log(`Subject: ${notification.title}`);
    console.log(`Body: ${notification.message}`);
    
    if (notification.requiresAction && notification.actionUrl) {
      console.log(`Action URL: ${notification.actionUrl}`);
    }
    
    // Simulate successful email sending
    return true;
  }

  /**
   * Send notification via SMS
   * @param phone Phone number
   * @param notification Notification to send
   * @returns Success status
   */
  private async sendSMS(
    phone: string,
    notification: UserNotification
  ): Promise<boolean> {
    // In a real implementation, this would use Twilio or another SMS service
    // For this example, we'll simulate sending an SMS
    
    console.log(`[Simulated] Sending SMS to ${phone}:`);
    console.log(`${notification.title}: ${notification.message}`);
    
    // Simulate successful SMS sending
    return true;
  }

  /**
   * Send push notification
   * @param deviceToken Device token
   * @param notification Notification to send
   * @returns Success status
   */
  private async sendPushNotification(
    deviceToken: string,
    notification: UserNotification
  ): Promise<boolean> {
    // In a real implementation, this would use Firebase Cloud Messaging or another push service
    // For this example, we'll simulate sending a push notification
    
    console.log(`[Simulated] Sending push notification to device ${deviceToken}:`);
    console.log(`Title: ${notification.title}`);
    console.log(`Body: ${notification.message}`);
    
    // Simulate successful push notification
    return true;
  }

  /**
   * Get user contact information
   * @param userId ID of the user
   * @returns User contact information
   */
  private async getUserContactInfo(userId: string): Promise<{
    email: string;
    phone: string;
    deviceToken: string;
  } | null> {
    try {
      const userDoc = await this.db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        return null;
      }
      
      const userData = userDoc.data();
      
      return {
        email: userData?.email || 'user@example.com', // Fallback for simulation
        phone: userData?.phone || '+15551234567', // Fallback for simulation
        deviceToken: userData?.deviceToken || 'simulated-device-token' // Fallback for simulation
      };
    } catch (error) {
      console.error('Error getting user contact info:', error);
      
      // Return simulated data for testing
      return {
        email: 'user@example.com',
        phone: '+15551234567',
        deviceToken: 'simulated-device-token'
      };
    }
  }
}
