const admin = require('firebase-admin');
const serviceAccount = require('./cutomerr-firebase-adminsdk-fbsvc-b639b3f567.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'cutomerr'
});

async function createFirestoreIndex() {
  try {
    console.log('🔄 Creating Firestore composite index...');

    // The index creation is typically handled via Firebase console or CLI
    // But we can check if the query works now
    const db = admin.firestore();

    // Test the query that was failing
    const threeDaysAgo = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000));

    const testQuery = db.collection('complaints')
      .where('escalationStatus', 'in', ['pending', 'in_progress', 'awaiting_response'])
      .where('createdAt', '<=', threeDaysAgo.toISOString())
      .limit(1);

    console.log('🧪 Testing query that requires the index...');

    try {
      const result = await testQuery.get();
      console.log('✅ Query executed successfully! Index appears to be working.');
      console.log(`Found ${result.size} documents`);
    } catch (error) {
      if (error.code === 9) {
        console.log('❌ Index still needed. Please create it manually via Firebase console:');
        console.log('🔗 https://console.firebase.google.com/project/cutomerr/firestore/indexes');
        console.log('');
        console.log('Required index configuration:');
        console.log('Collection: complaints');
        console.log('Fields: escalationStatus (Ascending), createdAt (Ascending)');
        console.log('');
        console.log('Or use this direct link from the error:');
        console.log('https://console.firebase.google.com/v1/r/project/cutomerr/firestore/indexes?create_composite=Cktwcm9qZWN0cy9jdXRvbWVyci9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvY29tcGxhaW50cy9pbmRleGVzL18QARoUChBlc2NhbGF0aW9uU3RhdHVzEAEaDQoJY3JlYXRlZEF0EAEaDAoIX19uYW1lX18QAQ');
      } else {
        console.error('❌ Query failed with different error:', error);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createFirestoreIndex();