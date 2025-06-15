import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { ComplaintResolutionSystem } from '../index';

const system = new ComplaintResolutionSystem();

export const submitComplaint = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be logged in to submit a complaint'
    );
  }

  // Get user ID from the auth token
  const userId = context.auth.uid;

  // Validate complaint data
  if (!data.text && !data.image) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Complaint must include either text or image'
    );
  }

  try {
    // Process the complaint
    const result = await system.processUnifiedComplaint({
      userId,
      text: data.text,
      image: data.image ? Buffer.from(data.image) : undefined
    });

    return {
      success: true,
      complaintId: result.complaintId,
      status: result.status,
      resolution: result.resolution,
      nextSteps: result.nextSteps
    };
  } catch (error) {
    console.error('Error processing complaint:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to process complaint',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}); 