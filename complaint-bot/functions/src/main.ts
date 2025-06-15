/**
 * Main entry point for running the AI-powered complaint resolution platform
 */
import { complaintResolutionSystem } from './index';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

/**
 * Process a complaint
 * @param userId User ID submitting the complaint
 * @param text Optional text complaint
 * @param imagePath Optional path to image file
 * @returns Promise resolving to complaint processing result
 */
async function processComplaint(
  userId: string, 
  text?: string, 
  imagePath?: string
): Promise<{
  complaintId: string;
  status: string;
  resolution?: string;
  nextSteps?: string;
}> {
  try {
    // Validate inputs
    if (!userId) {
      throw new Error('User ID is required');
    }

    if (!text && !imagePath) {
      throw new Error('Either text or image must be provided');
    }

    // Load image if provided
    let imageBuffer: Buffer | undefined;
    if (imagePath) {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }
      
      try {
        imageBuffer = fs.readFileSync(imagePath);
        console.log(`Image loaded from: ${imagePath} (${imageBuffer.length} bytes)`);
      } catch (error) {
        throw new Error(`Failed to read image file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log('Processing complaint...');
    console.log(`User ID: ${userId}`);
    console.log(`Text: ${text ? `"${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"` : 'None'}`);
    console.log(`Image: ${imagePath || 'None'}`);
    console.log('---');

    // Process the complaint
    const result = await complaintResolutionSystem.processUnifiedComplaint({
      userId,
      text,
      image: imageBuffer
    });

    console.log('✅ Complaint processed successfully:');
    console.log(JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error('❌ Error processing complaint:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Validate environment variables and configuration
 */
function validateEnvironment(): void {
  const requiredEnvVars = [
    'OPENAI_API_KEY',
    'BLAND_API_KEY',
    'GOOGLE_APPLICATION_CREDENTIALS' // For Firebase
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn('⚠️  Warning: Missing environment variables:');
    missingVars.forEach(varName => console.warn(`   - ${varName}`));
    console.warn('   Some features may not work properly.');
    console.warn('   Please check your .env file or environment configuration.');
  } else {
    console.log('✅ All required environment variables are set');
  }
}

/**
 * Display usage information
 */
function displayUsage(): void {
  console.log('AI-Powered Complaint Resolution Platform');
  console.log('========================================');
  console.log('');
  console.log('Usage:');
  console.log('  npm start process <userId> <text> [imagePath]   - Process a complaint');
  console.log('  npm start validate                              - Validate environment setup');
  console.log('');
  console.log('Examples:');
  console.log('  npm start process user123 "My internet is down for 3 days"');
  console.log('  npm start process user456 "Billing issue" ./receipt.jpg');
  console.log('  npm start process user789 "" ./complaint-screenshot.png');
  console.log('');
  console.log('Environment Variables Required:');
  console.log('  - OPENAI_API_KEY: OpenAI API key for NLP processing');
  console.log('  - BLAND_API_KEY: Bland AI API key for phone calls');
  console.log('  - GOOGLE_APPLICATION_CREDENTIALS: Path to Firebase service account JSON');
  console.log('');
}

/**
 * Main execution logic
 */
async function main(): Promise<void> {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const command = args[0];

    console.log('🚀 AI-Powered Complaint Resolution Platform Starting...\n');

    if (command === 'validate') {
      // Validate environment setup
      console.log('Validating environment setup...');
      validateEnvironment();
      return;
    } else if (command === 'process') {
      // Validate environment first
      validateEnvironment();
      
      // Process a complaint
      const userId = args[1];
      const text = args[2];
      const imagePath = args[3];

      if (!userId) {
        console.error('❌ Error: User ID is required');
        displayUsage();
        process.exit(1);
      }

      if (!text && !imagePath) {
        console.error('❌ Error: Must provide text complaint or image path');
        displayUsage();
        process.exit(1);
      }

      // Validate image path if provided
      if (imagePath) {
        const fullImagePath = path.resolve(imagePath);
        if (!fs.existsSync(fullImagePath)) {
          console.error(`❌ Error: Image file not found: ${fullImagePath}`);
          process.exit(1);
        }
      }

      await processComplaint(userId, text, imagePath);
      console.log('\n✅ Complaint processing completed successfully');
    } else if (command === 'test') {
      // Run tests
      console.log('Running tests...');
      const { runTests } = require('./test/testRunner');
      await runTests();
      console.log('Tests completed.');
    } else {
      // Display usage information
      displayUsage();
      
      if (command && command !== 'help') {
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Export functions for use in Firebase Functions or Express.js
export { processComplaint, validateEnvironment };

// If running directly (not imported)
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error in main:', error);
    process.exit(1);
  });
}