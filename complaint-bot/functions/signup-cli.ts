import { ComplaintResolutionSystem } from './src/index';
import { UserSignupData } from './src/modules/auth/types';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const system = new ComplaintResolutionSystem();

const askQuestion = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
};

const main = async () => {
  try {
    console.log('=== User Sign-up Test ===');
    const name = await askQuestion('Enter your name: ');
    const email = await askQuestion('Enter your email: ');
    const phone = await askQuestion('Enter your phone number: ');
    const password = await askQuestion('Enter your password: ');

    const userData: UserSignupData = {
      name,
      email,
      phone,
      password
    };

    console.log('\nAttempting to sign up with the following information:');
    console.log('Name:', name);
    console.log('Email:', email);
    console.log('Phone:', phone);
    console.log('Password:', '*'.repeat(password.length));
    console.log('\nProcessing sign-up...\n');

    const result = await system.signup(userData);
    
    if (result.success) {
      console.log('✅ Sign-up successful!');
      console.log('User ID:', result.userId);
    } else {
      console.log('❌ Sign-up failed!');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.error('❌ Error during sign-up:', error);
  } finally {
    rl.close();
  }
};

main(); 