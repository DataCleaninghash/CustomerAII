interface CallMetrics {
  callId: string;
  status: string;
  duration: number;
  ivrInteractions: number;
  humanInteractions: number;
  timestamp: Date;
}

export class MetricsCollector {
  private metrics: Map<string, CallMetrics> = new Map();

  recordCallMetrics(callId: string, callData: any): void {
    const metrics: CallMetrics = {
      callId,
      status: callData.status,
      duration: callData.duration || 0,
      ivrInteractions: callData.ivr_interactions?.length || 0,
      humanInteractions: callData.human_interactions?.length || 0,
      timestamp: new Date()
    };

    this.metrics.set(callId, metrics);
    this.emitMetrics(metrics);
  }

  private emitMetrics(metrics: CallMetrics): void {
    // In a real implementation, this would send metrics to a monitoring system
    // like Prometheus, Datadog, or CloudWatch
    console.log('Metrics:', metrics);
  }

  getMetrics(callId: string): CallMetrics | undefined {
    return this.metrics.get(callId);
  }

  getAllMetrics(): CallMetrics[] {
    return Array.from(this.metrics.values());
  }
} 