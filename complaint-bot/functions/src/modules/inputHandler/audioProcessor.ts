import { uploadFileToS3 } from '../s3/s3Uploader';
import axios from 'axios';
import FormData from 'form-data';

export class AudioProcessor {
  /**
   * Process an audio file: upload to S3, transcribe with Whisper, return transcript and S3 URL
   * @param audioBuffer Audio file buffer
   * @param mimeType Audio MIME type (e.g., 'audio/ogg', 'audio/mpeg')
   * @returns { transcript: string, audioS3Url: string }
   */
  async processAudio(audioBuffer: Buffer, mimeType: string): Promise<{ transcript: string; audioS3Url: string }> {
    // 1. Upload audio to S3
    const audioS3Url = await uploadFileToS3(audioBuffer, mimeType, 'complaint-audio');

    // 2. Send audio to OpenAI Whisper API for transcription
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'audiofile',
      contentType: mimeType,
    });
    formData.append('model', 'whisper-1');
    // Optionally, set language: formData.append('language', 'en');

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders(),
      },
      maxBodyLength: Infinity,
    });

    const transcript = response.data.text;
    return { transcript, audioS3Url };
  }
} 