/**
 * Debug script to check what contacts are stored for a contact list
 * Usage: node debug-contact-list.js <contactListId> <userId>
 */

const API_BASE_URL = 'http://localhost:3000';

async function debugContactList(contactListId, userId) {
  try {
    console.log('🔍 Debugging contact list:', contactListId);
    console.log('👤 User ID:', userId);
    
    const response = await fetch(`${API_BASE_URL}/contact-lists/${contactListId}/debug?userId=${userId}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }
    
    console.log('\n📊 Debug Results:');
    console.log('================');
    console.log('✅ Success:', data.success);
    console.log('📁 File Info:');
    console.log('   - Name:', data.fileInfo.originalName);
    console.log('   - Size:', (data.fileInfo.fileSize / 1024 / 1024).toFixed(2), 'MB');
    console.log('   - MIME Type:', data.fileInfo.mimeType);
    console.log('   - Processed:', data.fileInfo.processed);
    console.log('   - Contact Count (metadata):', data.fileInfo.contactCount);
    console.log('   - Upload Date:', new Date(data.fileInfo.uploadedAt._seconds * 1000).toLocaleString());
    
    console.log('\n👥 Actual Contacts Found:', data.contactCount);
    console.log('========================');
    
    if (data.contacts && data.contacts.length > 0) {
      data.contacts.forEach((contact, index) => {
        console.log(`\n${index + 1}. ${contact.name || 'No Name'}`);
        console.log(`   📧 Email: ${contact.email || 'No Email'}`);
        console.log(`   📞 Phone: ${contact.phone || 'No Phone'}`);
        console.log(`   🏢 Company: ${contact.company || 'No Company'}`);
        console.log(`   🏢 Department: ${contact.department || 'No Department'}`);
        console.log(`   👔 Role: ${contact.role || 'No Role'}`);
        console.log(`   🆔 Contact ID: ${contact.id}`);
      });
    } else {
      console.log('❌ No contacts found in database!');
      console.log('\nThis explains why RAG search is failing.');
      console.log('The PDF processing likely failed to extract contacts properly.');
    }
    
    console.log('\n💡 Recommendations:');
    if (data.contactCount === 0) {
      console.log('- The PDF processing failed to extract any contacts');
      console.log('- Check the PDF format and content');
      console.log('- Try re-uploading the PDF or convert it to CSV/Excel');
      console.log('- Check server logs for PDF processing errors');
    } else {
      console.log('- Contacts were found and should work with RAG search');
      console.log('- If RAG still fails, there might be an issue with the search logic');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('- Make sure the backend server is running');
    console.log('- Verify the contact list ID and user ID are correct');
    console.log('- Check that the contact list exists and belongs to the user');
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node debug-contact-list.js <contactListId> <userId>');
  console.log('');
  console.log('Example:');
  console.log('node debug-contact-list.js 93THURkj59nTJJ5qAekt ze6XnHnMhHhNciyTQ2oYZn17SRw1');
  process.exit(1);
}

const [contactListId, userId] = args;
debugContactList(contactListId, userId);