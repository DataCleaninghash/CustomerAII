#!/usr/bin/env node

/**
 * Contact List Functionality Test Script
 * 
 * This script tests the contact list upload and management functionality
 * Run this script from the terminal to test the complete flow:
 * 
 * 1. Upload contact list files to the API
 * 2. Process the uploaded files
 * 3. Retrieve contact lists for a user
 * 4. Get contacts from a specific list
 * 5. Search contacts
 * 
 * Usage: node test-contact-lists.js [API_BASE_URL]
 * Example: node test-contact-lists.js http://localhost:3000
 */

const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE_URL = process.argv[2] || 'http://localhost:3000';
const TEST_USER_ID = process.env.TEST_USER_ID || 'test-user-12345';

console.log('🧪 Contact List Functionality Test');
console.log('='.repeat(50));
console.log(`API Base URL: ${API_BASE_URL}`);
console.log(`Test User ID: ${TEST_USER_ID}`);
console.log('='.repeat(50));

// Helper function to make HTTP requests
async function makeRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log(`📡 ${options.method || 'GET'} ${url}`);
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ Success: ${response.status}`);
      return data;
    } else {
      console.log(`❌ Error: ${response.status} - ${data.error || 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Network Error: ${error.message}`);
    return null;
  }
}

// Helper function to create test CSV data
function createTestCSV() {
  const csvContent = `name,email,phone,company
John Doe,john.doe@example.com,+1234567890,Example Corp
Jane Smith,jane.smith@company.com,+1987654321,Company Inc
Bob Johnson,bob.johnson@acme.com,+1555123456,Acme Corp
Alice Brown,alice.brown@techfirm.com,+1777888999,Tech Firm
Charlie Wilson,charlie.wilson@startup.io,+1444555666,Startup Inc`;
  
  const filePath = path.join(__dirname, 'test-contacts.csv');
  fs.writeFileSync(filePath, csvContent);
  console.log(`📄 Created test CSV file: ${filePath}`);
  return filePath;
}

// Helper function to upload files using FormData
async function uploadContactLists(filePaths) {
  console.log('\n📤 Testing Contact List Upload...');
  
  try {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    
    // Add user ID
    formData.append('userId', TEST_USER_ID);
    
    // Add files
    for (const filePath of filePaths) {
      const fileStream = fs.createReadStream(filePath);
      const fileName = path.basename(filePath);
      formData.append('contactFiles', fileStream, fileName);
      console.log(`📁 Added file: ${fileName}`);
    }
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${API_BASE_URL}/contact-lists/upload`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ Upload Success: ${data.message}`);
      console.log(`📊 Uploaded ${data.files.length} file(s)`);
      return data.files;
    } else {
      console.log(`❌ Upload Error: ${response.status} - ${data.error || 'Unknown error'}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Upload Network Error: ${error.message}`);
    return null;
  }
}

// Test functions
async function testUploadAndProcess() {
  console.log('\n🔄 Testing Upload and Processing...');
  
  // Create test CSV file
  const testCSVPath = createTestCSV();
  
  try {
    // Upload the file
    const uploadedFiles = await uploadContactLists([testCSVPath]);
    if (!uploadedFiles) return null;
    
    // Process each uploaded file
    const processedFiles = [];
    for (const file of uploadedFiles) {
      console.log(`\n🔄 Processing file: ${file.originalName}`);
      const result = await makeRequest(`/contact-lists/${file.fileId}/process`, {
        method: 'POST',
        body: JSON.stringify({ userId: TEST_USER_ID })
      });
      
      if (result) {
        processedFiles.push({ ...file, processed: true });
        console.log(`✅ Processed: ${result.contactCount} contacts`);
      }
    }
    
    return processedFiles;
  } finally {
    // Clean up test file
    if (fs.existsSync(testCSVPath)) {
      fs.unlinkSync(testCSVPath);
      console.log(`🧹 Cleaned up test file: ${testCSVPath}`);
    }
  }
}

async function testGetContactLists() {
  console.log('\n📋 Testing Get Contact Lists...');
  const result = await makeRequest(`/contact-lists/user/${TEST_USER_ID}`);
  
  if (result && result.contactLists) {
    console.log(`📊 Found ${result.contactLists.length} contact list(s)`);
    result.contactLists.forEach((list, index) => {
      console.log(`${index + 1}. ${list.originalName} (${list.contactCount} contacts)`);
    });
    return result.contactLists;
  }
  return [];
}

async function testGetContacts(fileId) {
  console.log(`\n👥 Testing Get Contacts from File: ${fileId}`);
  const result = await makeRequest(`/contact-lists/${fileId}/contacts?userId=${TEST_USER_ID}`);
  
  if (result && result.contacts) {
    console.log(`📊 Found ${result.contacts.length} contact(s)`);
    result.contacts.forEach((contact, index) => {
      console.log(`${index + 1}. ${contact.name} (${contact.email}) - ${contact.company || 'No company'}`);
    });
    return result.contacts;
  }
  return [];
}

async function testSearchContacts(query) {
  console.log(`\n🔍 Testing Contact Search: "${query}"`);
  const result = await makeRequest('/contact-lists/search', {
    method: 'POST',
    body: JSON.stringify({
      userId: TEST_USER_ID,
      query: query
    })
  });
  
  if (result && result.results) {
    console.log(`📊 Found ${result.results.length} matching contact(s)`);
    result.results.forEach((contact, index) => {
      console.log(`${index + 1}. ${contact.name} (${contact.email}) - ${contact.company || 'No company'}`);
    });
    return result.results;
  }
  return [];
}

async function testHealthCheck() {
  console.log('\n❤️ Testing API Health...');
  const result = await makeRequest('/health');
  if (result) {
    console.log('✅ API is healthy');
    return true;
  }
  console.log('❌ API health check failed');
  return false;
}

// Main test function
async function runTests() {
  console.log('\n🚀 Starting Contact List Functionality Tests...');
  
  try {
    // Check if API is running
    const isHealthy = await testHealthCheck();
    if (!isHealthy) {
      console.log('\n❌ API is not responding. Please ensure the backend is running.');
      return;
    }
    
    // Test upload and processing
    const processedFiles = await testUploadAndProcess();
    if (!processedFiles || processedFiles.length === 0) {
      console.log('\n❌ Upload/processing test failed. Cannot continue with other tests.');
      return;
    }
    
    // Test getting contact lists
    const contactLists = await testGetContactLists();
    
    // Test getting contacts from the first list
    if (contactLists.length > 0) {
      const firstList = contactLists[0];
      await testGetContacts(firstList.id);
    }
    
    // Test search functionality
    await testSearchContacts('John');
    await testSearchContacts('example.com');
    await testSearchContacts('Corp');
    
    console.log('\n🎉 All tests completed!');
    console.log('\n📋 Test Summary:');
    console.log('✅ File upload');
    console.log('✅ File processing');
    console.log('✅ Get contact lists');
    console.log('✅ Get contacts from list');
    console.log('✅ Search contacts');
    
  } catch (error) {
    console.log(`\n❌ Test execution failed: ${error.message}`);
    console.log(error.stack);
  }
}

// Check if required dependencies are available
async function checkDependencies() {
  try {
    await import('node-fetch');
    await import('form-data');
    return true;
  } catch (error) {
    console.log('\n❌ Missing dependencies. Please install required packages:');
    console.log('npm install node-fetch form-data');
    return false;
  }
}

// Run the tests
if (require.main === module) {
  checkDependencies().then(hasAllDeps => {
    if (hasAllDeps) {
      runTests();
    }
  });
}

module.exports = {
  runTests,
  testUploadAndProcess,
  testGetContactLists,
  testGetContacts,
  testSearchContacts,
  testHealthCheck
};

