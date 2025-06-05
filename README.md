# HeyCodex - Complaint Resolution System

A sophisticated complaint resolution system that uses AI to process, analyze, and resolve customer complaints through automated calls and follow-up questions.

## Features

- Multi-modal complaint input (text, image, audio)
- AI-powered entity recognition
- Automated follow-up questions
- Contact information extraction
- Automated call resolution
- Firebase integration for data persistence

## Setup

1. Clone the repository:
```bash
git clone https://github.com/MEDUSA2O/HeyCodex.git
cd HeyCodex
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```
Edit `.env` with your API keys and configuration.

4. Add Firebase credentials:
Place your Firebase service account key in the root directory as `firebase-credentials.json`

## Development

Run the development server:
```bash
npm run dev
```

Run tests:
```bash
npm test
```

## Environment Variables

Required environment variables:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `BLAND_AI_API_KEY`
- `SERP_API_KEY`
- `OPENAI_API_KEY`

## License

Private repository - All rights reserved 