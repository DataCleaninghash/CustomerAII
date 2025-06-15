/**
 * Main interface for the logging and notification module
 */
import { SystemAction, UserNotification } from '../../types/logging';
import { Logger } from './logger';
import { NotificationService } from './notificationService';
import { DatabaseConnector } from './databaseConnector';

export class LoggingSystem {
  private logger: Logger;
  private notificationService: NotificationService;
  private databaseConnector: DatabaseConnector;

  constructor() {
    this.logger = new Logger();
    this.notificationService = new NotificationService();
    this.databaseConnector = DatabaseConnector.getInstance();
  }

  /**
   * Log a system action
   * @param complaintId ID of the complaint
   * @param action System action to log
   * @param details Additional details
   * @returns Success status
   */
  async logAction(
    complaintId: string,
    action: string,
    module: string,
    status: 'success' | 'failure' | 'in_progress',
    details: Record<string, any> = {}
  ): Promise<boolean> {
    const systemAction: SystemAction = {
      timestamp: new Date(),
      module,
      action,
      status,
      details
    };

    return await this.logger.logAction(complaintId, systemAction);
  }

  /**
   * Get complaint history
   * @param complaintId ID of the complaint
   * @returns Array of system actions
   */
  async getComplaintHistory(complaintId: string): Promise<SystemAction[]> {
    return await this.logger.getComplaintHistory(complaintId);
  }

  /**
   * Notify user
   * @param userId ID of the user
   * @param notification Notification to send
   * @returns Success status
   */
  async notifyUser(
    userId: string,
    notification: UserNotification
  ): Promise<boolean> {
    return await this.notificationService.notifyUser(userId, notification);
  }

  /**
   * Create a status update notification
   * @param title Notification title
   * @param message Notification message
   * @param requiresAction Whether the notification requires action
   * @param actionUrl Optional action URL
   * @returns User notification object
   */
  createStatusNotification(
    title: string,
    message: string,
    requiresAction: boolean = false,
    actionUrl?: string
  ): UserNotification {
    return {
      type: 'status_update',
      title,
      message,
      requiresAction,
      actionUrl
    };
  }

  /**
   * Create a question notification
   * @param title Notification title
   * @param message Notification message
   * @param actionUrl Action URL
   * @returns User notification object
   */
  createQuestionNotification(
    title: string,
    message: string,
    actionUrl: string
  ): UserNotification {
    return {
      type: 'question',
      title,
      message,
      requiresAction: true,
      actionUrl
    };
  }

  /**
   * Create a resolution notification
   * @param title Notification title
   * @param message Notification message
   * @param actionUrl Optional action URL
   * @returns User notification object
   */
  createResolutionNotification(
    title: string,
    message: string,
    actionUrl?: string
  ): UserNotification {
    return {
      type: 'resolution',
      title,
      message,
      requiresAction: false,
      actionUrl
    };
  }

  /**
   * Create an error notification
   * @param title Notification title
   * @param message Notification message
   * @param requiresAction Whether the notification requires action
   * @param actionUrl Optional action URL
   * @returns User notification object
   */
  createErrorNotification(
    title: string,
    message: string,
    requiresAction: boolean = false,
    actionUrl?: string
  ): UserNotification {
    return {
      type: 'error',
      title,
      message,
      requiresAction,
      actionUrl
    };
  }

  /**
   * Get database connector
   * @returns Database connector instance
   */
  getDatabaseConnector(): DatabaseConnector {
    return this.databaseConnector;
  }
}

// Export singleton instance for easy import
export const loggingSystem = new LoggingSystem();

// Export all classes for testing and extension
export { Logger, NotificationService, DatabaseConnector };
