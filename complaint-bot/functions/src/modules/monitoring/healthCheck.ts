interface HealthStatus {
  healthy: boolean;
  timestamp: Date;
  services: {
    [key: string]: {
      status: 'healthy' | 'unhealthy';
      message?: string;
    };
  };
}

export class HealthCheck {
  async check(): Promise<HealthStatus> {
    const status: HealthStatus = {
      healthy: true,
      timestamp: new Date(),
      services: {}
    };

    // Check Bland AI API
    try {
      const response = await fetch('https://api.bland.ai/v1/health');
      status.services.blandAi = {
        status: response.ok ? 'healthy' : 'unhealthy',
        message: response.ok ? undefined : 'API returned non-200 status'
      };
      if (!response.ok) status.healthy = false;
    } catch (error) {
      status.services.blandAi = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
      status.healthy = false;
    }

    // Check database connection
    try {
      const admin = require('firebase-admin');
      if (!admin.apps.length) {
        throw new Error('Firebase not initialized');
      }
      status.services.database = {
        status: 'healthy'
      };
    } catch (error) {
      status.services.database = {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error'
      };
      status.healthy = false;
    }

    return status;
  }
} 