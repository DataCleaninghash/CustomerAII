import * as readline from 'readline';
import { ComplaintProcessor } from './src/modules/complaintProcessing/complaintProcessor';
import { entityResolver } from './src/modules/entityResolver';
import { inputHandler } from './src/modules/inputHandler';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  try {
    // Get user ID
    const userId = await new Promise<string>((resolve) => {
      rl.question('Enter your user ID: ', (answer) => {
        resolve(answer.trim());
      });
    });

    // Get complaint text
    const complaintText = await new Promise<string>((resolve) => {
      rl.question('Enter your complaint: ', (answer) => {
        resolve(answer.trim());
      });
    });

    // Extract context from complaint text
    const context = await inputHandler.processComplaint(complaintText);

    // Identify the company from the context
    const companyInfo = await entityResolver.identifyCompany(context);

    // Get contact details for the identified company
    const contactDetails = await entityResolver.getContactDetails(companyInfo.name);

    // Process the complaint
    const processor = new ComplaintProcessor();
    const result = await processor.processComplaint(userId, complaintText, contactDetails);

    // Display the result
    console.log('\nComplaint Processing Result:');
    console.log('----------------------------');
    console.log(`Status: ${result.success ? 'Success' : 'Failed'}`);
    console.log(`Message: ${result.message}`);
    if (result.callId) {
      console.log(`Call ID: ${result.callId}`);
    }
    console.log('If the company uses IVR, check the server logs for DTMF/IVR handling.');

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error occurred');
  } finally {
    rl.close();
  }
}

main(); 