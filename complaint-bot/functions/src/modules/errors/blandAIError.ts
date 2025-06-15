export class BlandAIError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean
  ) {
    super(message);
    this.name = 'BlandAIError';
  }
} 