// Script to get Firebase Web API Key for the project
const admin = require('firebase-admin');
const serviceAccount = require('./cutomerr-firebase-adminsdk-fbsvc-b639b3f567.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'cutomerr'
});

async function getFirebaseConfig() {
  try {
    console.log('🔍 Getting Firebase project configuration...');
    console.log('Project ID:', serviceAccount.project_id);

    // The Web API key is typically in the format: AIzaSy[...]
    // It's not in the service account JSON, so we need to get it from Firebase Console
    console.log('\n📋 To get the Firebase Web API Key:');
    console.log('1. Go to: https://console.firebase.google.com/project/cutomerr/settings/general');
    console.log('2. Scroll down to "Your apps" section');
    console.log('3. Look for "Web API Key" in the configuration');
    console.log('4. Copy the API key that starts with "AIzaSy..."');

    // Alternative: Check if we can get it from the project metadata
    console.log('\n⚠️  The Web API Key is not available in the service account JSON.');
    console.log('You need to manually get it from the Firebase Console.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

getFirebaseConfig();