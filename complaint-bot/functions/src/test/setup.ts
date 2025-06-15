import * as admin from 'firebase-admin';

// Initialize Firebase Admin for testing
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'test-project',
    storageBucket: 'test-project.appspot.com'
  });
}

// Mock Firebase Auth
jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    createUser: jest.fn(),
    getUserByEmail: jest.fn(),
    getUserByPhoneNumber: jest.fn()
  }))
}));

// Mock Firestore
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn()
      }))
    }))
  }))
})); 