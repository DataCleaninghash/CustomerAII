import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    const serviceAccountPath = 'C:\\Users\\shweta patel\\Downloads\\Master2\\cutomerr-firebase-adminsdk-fbsvc-b639b3f567.json';
    
    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(`Service account file not found at: ${serviceAccountPath}`);
    }

    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    // Initialize Firebase Admin with service account
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log('Firebase initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    throw error;
  }
}

// Export Firestore instance and admin
export const db = admin.firestore();
export { admin }; 