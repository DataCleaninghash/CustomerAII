import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { db } from '../../config/firebase';
import * as admin from 'firebase-admin';
import { LLMEmailGenerator, EmailGenerationContext, GeneratedEmailContent } from './llmEmailGenerator';

// Interfaces
interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  emailId?: string;
  sentTo: string[];
  timestamp: Date;
  aiGenerated?: boolean;
  tone?: string;
  estimatedResponseTime?: string;
}

interface ComplaintEmailData {
  complaintId: string;
  userDetails: {
    name: string;
    email: string;
    phone: string;
  };
  companyInfo: {
    name: string;
    emails: string[];
    industry?: string;
    knownPolicies?: string[];
  };
  complaintDetails: {
    originalComplaint: string;
    extractedFields: any;
    conversationHistory?: any[];
  };
  priority: 'high' | 'medium' | 'low';
  attachments?: string[];
  useAI?: boolean;
}

class EmailManager {
  private transporter: nodemailer.Transporter | null = null;
  private isInitialized = false;
  private llmGenerator: LLMEmailGenerator;

  constructor() {
    this.llmGenerator = new LLMEmailGenerator();
    this.initializeTransporter();
  }

  public async initializeTransporter() {
    try {
      // Option 1: Gmail with App Password (Recommended for simplicity)
      if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD // App password, not regular password
          }
        });
        console.log(chalk.green('✓ Gmail transporter initialized'));
      }
      
      // Option 2: Gmail with OAuth2 (More secure)
      else if (process.env.EMAIL_SERVICE === 'gmail-oauth') {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GMAIL_CLIENT_ID,
          process.env.GMAIL_CLIENT_SECRET,
          'https://developers.google.com/oauthplayground'
        );

        oauth2Client.setCredentials({
          refresh_token: process.env.GMAIL_REFRESH_TOKEN
        });

        const accessToken = await oauth2Client.getAccessToken();

        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            type: 'OAuth2',
            user: process.env.EMAIL_USER,
            clientId: process.env.GMAIL_CLIENT_ID,
            clientSecret: process.env.GMAIL_CLIENT_SECRET,
            refreshToken: process.env.GMAIL_REFRESH_TOKEN,
            accessToken: accessToken.token || ''
          }
        });
        console.log(chalk.green('✓ Gmail OAuth2 transporter initialized'));
      }
      
      // Option 3: Custom SMTP (for other email providers)
      else if (process.env.SMTP_HOST) {
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
          }
        });
        console.log(chalk.green('✓ Custom SMTP transporter initialized'));
      }
      
      else {
        throw new Error('Email configuration not found. Please check environment variables.');
      }

      // Verify transporter
      if (this.transporter) {
        await this.transporter.verify();
        this.isInitialized = true;
        console.log(chalk.green('✓ Email transporter verified successfully'));
      }

    } catch (error) {
      console.error(chalk.red('✗ Email transporter initialization failed:'), error);
      this.isInitialized = false;
    }
  }

  async sendComplaintEmail(emailData: ComplaintEmailData): Promise<EmailResult> {
    if (!this.isInitialized || !this.transporter) {
      return {
        success: false,
        error: 'Email transporter not initialized',
        sentTo: [],
        timestamp: new Date()
      };
    }

    try {
      // Validate and ensure data structure
      const safeEmailData = this.validateEmailData(emailData);
      
      console.log(chalk.blue(`📧 Preparing complaint email for ${safeEmailData.companyInfo.name}...`));

      let emailContent: string;
      let subject: string;
      let aiGenerated = false;
      let tone = 'professional';
      let estimatedResponseTime = '3-5 business days';

      // Choose between AI generation and template
      if (safeEmailData.useAI !== false && process.env.OPENAI_API_KEY) {
        try {
          console.log(chalk.blue('🤖 Using AI to generate personalized email content...'));
          
          const aiEmailContent = await this.generateAIEmail(safeEmailData, 'initial');
          emailContent = aiEmailContent.htmlContent;
          subject = aiEmailContent.subject;
          aiGenerated = true;
          tone = aiEmailContent.tone;
          estimatedResponseTime = aiEmailContent.estimatedResponseTime;

          console.log(chalk.green('✓ AI-generated email content ready'));
          console.log(chalk.gray(`Tone: ${tone} | Expected response: ${estimatedResponseTime}`));

        } catch (aiError) {
          console.log(chalk.yellow('⚠ AI generation failed, using template fallback...'));
          console.error(chalk.red('AI Error details:'), aiError);
          const templateContent = await this.generateTemplateEmail(safeEmailData);
          emailContent = templateContent.htmlContent;
          subject = templateContent.subject;
        }
      } else {
        console.log(chalk.blue('📝 Using template-based email generation...'));
        const templateContent = await this.generateTemplateEmail(safeEmailData);
        emailContent = templateContent.htmlContent;
        subject = templateContent.subject;
      }

      // Prepare attachments
      const attachments = await this.prepareAttachments(safeEmailData.attachments);

      // Send to all company emails
      const results: EmailResult[] = [];
      
      for (const companyEmail of safeEmailData.companyInfo.emails) {
        try {
          const mailOptions = {
            from: {
              name: `${safeEmailData.userDetails.name} (via Complaint Resolution System)`,
              address: process.env.EMAIL_USER || ''
            },
            to: companyEmail,
            cc: safeEmailData.userDetails.email,
            subject: subject,
            html: emailContent,
            attachments: attachments,
            headers: {
              'X-Complaint-ID': safeEmailData.complaintId,
              'X-Priority': safeEmailData.priority === 'high' ? '1' : safeEmailData.priority === 'medium' ? '3' : '5',
              'X-AI-Generated': aiGenerated ? 'true' : 'false',
              'X-Email-Tone': tone
            }
          };

          const result = await this.transporter.sendMail(mailOptions);
          
          console.log(chalk.green(`✓ Email sent to ${companyEmail}`));
          console.log(chalk.gray(`Message ID: ${result.messageId}`));

          // Store email record with AI metadata
          const emailId = await this.storeEmailRecord({
            complaintId: safeEmailData.complaintId,
            recipientEmail: companyEmail,
            messageId: result.messageId,
            subject: subject,
            content: emailContent,
            status: 'sent',
            sentAt: new Date(),
            aiGenerated: aiGenerated,
            tone: tone,
            estimatedResponseTime: estimatedResponseTime
          });

          results.push({
            success: true,
            messageId: result.messageId,
            emailId: emailId,
            sentTo: [companyEmail],
            timestamp: new Date(),
            aiGenerated: aiGenerated,
            tone: tone,
            estimatedResponseTime: estimatedResponseTime
          });

        } catch (emailError: any) {
          console.error(chalk.red(`✗ Failed to send email to ${companyEmail}:`), emailError.message);
          
          results.push({
            success: false,
            error: emailError.message,
            sentTo: [companyEmail],
            timestamp: new Date()
          });
        }
      }

      // Return combined result
      const successCount = results.filter(r => r.success).length;
      const allSentTo = results.flatMap(r => r.sentTo);

      if (successCount > 0) {
        return {
          success: true,
          messageId: results.find(r => r.success)?.messageId,
          sentTo: allSentTo,
          timestamp: new Date(),
          aiGenerated: aiGenerated,
          tone: tone,
          estimatedResponseTime: estimatedResponseTime
        };
      } else {
        return {
          success: false,
          error: `Failed to send to all ${safeEmailData.companyInfo.emails.length} recipients`,
          sentTo: allSentTo,
          timestamp: new Date()
        };
      }

    } catch (error: any) {
      console.error(chalk.red('✗ Email sending failed:'), error);
      return {
        success: false,
        error: error.message,
        sentTo: [],
        timestamp: new Date()
      };
    }
  }

  private validateEmailData(emailData: ComplaintEmailData): ComplaintEmailData {
    // Ensure all required fields exist with proper defaults
    return {
      complaintId: emailData.complaintId || 'NO-ID',
      userDetails: {
        name: emailData.userDetails?.name || 'Unknown Customer',
        email: emailData.userDetails?.email || 'no-email@example.com',
        phone: emailData.userDetails?.phone || 'No phone provided'
      },
      companyInfo: {
        name: emailData.companyInfo?.name || 'Unknown Company',
        emails: Array.isArray(emailData.companyInfo?.emails) ? emailData.companyInfo.emails : [],
        industry: emailData.companyInfo?.industry,
        knownPolicies: emailData.companyInfo?.knownPolicies
      },
      complaintDetails: {
        originalComplaint: emailData.complaintDetails?.originalComplaint || 'No complaint text provided',
        extractedFields: emailData.complaintDetails?.extractedFields || {},
        conversationHistory: emailData.complaintDetails?.conversationHistory || []
      },
      priority: emailData.priority || 'medium',
      attachments: emailData.attachments,
      useAI: emailData.useAI
    };
  }

  private async generateAIEmail(emailData: ComplaintEmailData, emailType: 'initial' | 'followup' | 'escalation'): Promise<GeneratedEmailContent> {
    // Ensure all data is properly structured before passing to LLM
    const context: EmailGenerationContext = {
      complaintData: {
        originalComplaint: emailData.complaintDetails?.originalComplaint || 'No complaint text provided',
        extractedFields: emailData.complaintDetails?.extractedFields || {},
        conversationHistory: emailData.complaintDetails?.conversationHistory || []
      },
      userDetails: {
        name: emailData.userDetails?.name || 'Unknown Customer',
        email: emailData.userDetails?.email || 'no-email@example.com',
        phone: emailData.userDetails?.phone || 'No phone provided'
      },
      companyInfo: {
        name: emailData.companyInfo?.name || 'Unknown Company',
        emails: emailData.companyInfo?.emails || [],
        industry: emailData.companyInfo?.industry,
        knownPolicies: emailData.companyInfo?.knownPolicies
      },
      priority: emailData.priority || 'medium',
      emailType: emailType
    };

    return await this.llmGenerator.generateComplaintEmail(context);
  }

  private async generateTemplateEmail(emailData: ComplaintEmailData): Promise<{ htmlContent: string; subject: string }> {
    const subject = this.generateSubjectLine(emailData);
    const htmlContent = await this.generateComplaintEmailTemplate(emailData);
    
    return { htmlContent, subject };
  }

  // Updated follow-up email with AI support
  async sendFollowUpEmail(emailData: ComplaintEmailData, callResult: any): Promise<EmailResult> {
    if (!this.isInitialized || !this.transporter) {
      return {
        success: false,
        error: 'Email transporter not initialized',
        sentTo: [],
        timestamp: new Date()
      };
    }

    try {
      // Validate email data
      const safeEmailData = this.validateEmailData(emailData);
      
      let subject: string;
      let emailContent: string;
      let aiGenerated = false;

      if (safeEmailData.useAI !== false && process.env.OPENAI_API_KEY) {
        try {
          console.log(chalk.blue('🤖 Generating AI follow-up email with call results...'));
          
          const context: EmailGenerationContext = {
            complaintData: {
              originalComplaint: safeEmailData.complaintDetails.originalComplaint,
              extractedFields: safeEmailData.complaintDetails.extractedFields,
              conversationHistory: safeEmailData.complaintDetails.conversationHistory || []
            },
            userDetails: safeEmailData.userDetails,
            companyInfo: safeEmailData.companyInfo,
            priority: safeEmailData.priority,
            emailType: 'followup',
            callResult: callResult
          };

          const aiContent = await this.llmGenerator.generateComplaintEmail(context);
          subject = aiContent.subject;
          emailContent = aiContent.htmlContent;
          aiGenerated = true;

        } catch (aiError) {
          console.log(chalk.yellow('⚠ AI follow-up generation failed, using template...'));
          console.error(chalk.red('AI Error details:'), aiError);
          subject = `Follow-up: ${this.generateSubjectLine(safeEmailData)} - Call Completed`;
          emailContent = this.generateFollowUpTemplate(safeEmailData, callResult);
        }
      } else {
        subject = `Follow-up: ${this.generateSubjectLine(safeEmailData)} - Call Completed`;
        emailContent = this.generateFollowUpTemplate(safeEmailData, callResult);
      }

      const mailOptions = {
        from: {
          name: `${safeEmailData.userDetails.name} (via Complaint Resolution System)`,
          address: process.env.EMAIL_USER || ''
        },
        to: safeEmailData.companyInfo.emails,
        cc: safeEmailData.userDetails.email,
        subject: subject,
        html: emailContent,
        headers: {
          'X-Complaint-ID': safeEmailData.complaintId,
          'X-Call-ID': callResult.callId,
          'X-AI-Generated': aiGenerated ? 'true' : 'false'
        }
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      console.log(chalk.green(`✓ Follow-up email sent`));

      return {
        success: true,
        messageId: result.messageId,
        sentTo: safeEmailData.companyInfo.emails,
        timestamp: new Date(),
        aiGenerated: aiGenerated
      };

    } catch (error: any) {
      console.error(chalk.red('✗ Follow-up email failed:'), error);
      return {
        success: false,
        error: error.message,
        sentTo: [],
        timestamp: new Date()
      };
    }
  }

  private async prepareAttachments(attachmentPaths?: string[]): Promise<any[]> {
    if (!attachmentPaths || attachmentPaths.length === 0) {
      return [];
    }

    const attachments: any[] = [];

    for (const filePath of attachmentPaths) {
      try {
        if (fs.existsSync(filePath)) {
          const fileName = path.basename(filePath);
          const fileContent = fs.readFileSync(filePath);
          
          attachments.push({
            filename: fileName,
            content: fileContent,
            contentType: this.getContentType(fileName)
          });
          
          console.log(chalk.green(`✓ Attachment prepared: ${fileName}`));
        } else {
          console.warn(chalk.yellow(`⚠ Attachment not found: ${filePath}`));
        }
      } catch (error) {
        console.error(chalk.red(`✗ Failed to prepare attachment ${filePath}:`), error);
      }
    }

    return attachments;
  }

  private getContentType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain'
    };
    
    return contentTypes[ext] || 'application/octet-stream';
  }

  private async storeEmailRecord(data: {
    complaintId: string;
    recipientEmail: string;
    messageId: string;
    subject: string;
    content: string;
    status: string;
    sentAt: Date;
    aiGenerated?: boolean;
    tone?: string;
    estimatedResponseTime?: string;
  }): Promise<string> {
    try {
      const emailRef = await db.collection('emails').add({
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return emailRef.id;
    } catch (error) {
      console.error(chalk.red('Failed to store email record:'), error);
      throw error;
    }
  }

  private generateSubjectLine(emailData: ComplaintEmailData): string {
    // Defensive checks for all fields
    const issue = emailData.complaintDetails?.extractedFields?.issue || 'Customer Service Issue';
    const product = emailData.complaintDetails?.extractedFields?.product;
    const customerName = emailData.userDetails?.name || 'Customer';
    
    let subject = `Customer Complaint - ${issue}`;
    
    if (product && product !== 'Not specified') {
      subject += ` - ${product}`;
    }
    
    subject += ` (Ref: ${emailData.complaintId || 'NO-REF'})`;
    
    if (emailData.priority === 'high') {
      subject = `[URGENT] ${subject}`;
    }
    
    return subject;
  }

  private async generateComplaintEmailTemplate(emailData: ComplaintEmailData): Promise<string> {
    const { userDetails, companyInfo, complaintDetails } = emailData;
    const timestamp = new Date().toLocaleString();
    
    // Defensive checks with proper defaults
    const safeCompanyName = companyInfo?.name || 'Unknown Company';
    const safeUserName = userDetails?.name || 'Unknown Customer';
    const safeUserEmail = userDetails?.email || 'no-email@example.com';
    const safeUserPhone = userDetails?.phone || 'No phone provided';
    
    // Extract key information with defaults
    const issue = complaintDetails?.extractedFields?.issue || 'General complaint';
    const product = complaintDetails?.extractedFields?.product || 'Not specified';
    const dateOfIssue = complaintDetails?.extractedFields?.date || 'Recently';
    const desiredResolution = complaintDetails?.extractedFields?.resolution || 'Fair resolution of the issue';
    const originalComplaint = complaintDetails?.originalComplaint || 'No complaint details provided';
    const conversationHistory = complaintDetails?.conversationHistory || [];

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .complaint-id { background-color: #e3f2fd; padding: 10px; border-radius: 4px; font-weight: bold; }
        .section { margin: 20px 0; }
        .label { font-weight: bold; color: #1976d2; }
        .priority-high { color: #d32f2f; }
        .priority-medium { color: #f57c00; }
        .priority-low { color: #388e3c; }
        .footer { margin-top: 30px; padding: 15px; background-color: #f5f5f5; border-radius: 4px; font-size: 12px; }
        .conversation { background-color: #fafafa; padding: 15px; border-radius: 4px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h2>Customer Service Complaint - ${safeCompanyName}</h2>
        <div class="complaint-id">Complaint ID: ${emailData.complaintId || 'NO-ID'}</div>
        <p><strong>Priority:</strong> <span class="priority-${emailData.priority || 'medium'}">${(emailData.priority || 'medium').toUpperCase()}</span></p>
        <p><strong>Submitted:</strong> ${timestamp}</p>
    </div>

    <div class="section">
        <h3>Customer Information</h3>
        <p><span class="label">Name:</span> ${safeUserName}</p>
        <p><span class="label">Email:</span> ${safeUserEmail}</p>
        <p><span class="label">Phone:</span> ${safeUserPhone}</p>
    </div>

    <div class="section">
        <h3>Complaint Details</h3>
        <p><span class="label">Issue Type:</span> ${issue}</p>
        <p><span class="label">Product/Service:</span> ${product}</p>
        <p><span class="label">Date of Issue:</span> ${dateOfIssue}</p>
        <p><span class="label">Desired Resolution:</span> ${desiredResolution}</p>
    </div>

    <div class="section">
        <h3>Detailed Complaint</h3>
        <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #2196f3; margin: 10px 0;">
            ${originalComplaint.replace(/\n/g, '<br>')}
        </div>
    </div>

    ${conversationHistory && conversationHistory.length > 0 ? `
    <div class="section">
        <h3>Additional Information Gathered</h3>
        ${conversationHistory.map((qa: any) => `
            <div class="conversation">
                <p><strong>Q:</strong> ${qa.question || 'No question'}</p>
                <p><strong>A:</strong> ${qa.answer || 'No answer'}</p>
            </div>
        `).join('')}
    </div>
    ` : ''}

    <div class="section">
        <h3>Requested Action</h3>
        <p>We are writing on behalf of <strong>${safeUserName}</strong> to formally request your assistance in resolving this matter. The customer has provided detailed information above and is seeking a fair resolution.</p>
        
        <p><strong>Please:</strong></p>
        <ul>
            <li>Review the complaint details provided</li>
            <li>Contact the customer directly at ${safeUserEmail} or ${safeUserPhone}</li>
            <li>Provide a reference/case number for tracking</li>
            <li>Respond with resolution steps and timeline</li>
        </ul>
    </div>

    <div class="footer">
        <p><strong>This email was sent via an automated complaint resolution system.</strong></p>
        <p>For questions about this system, please contact the customer directly using the information provided above.</p>
        <p>Complaint Reference: ${emailData.complaintId || 'NO-ID'} | Sent: ${timestamp}</p>
    </div>
</body>
</html>
    `.trim();
  }

  private generateFollowUpTemplate(emailData: ComplaintEmailData, callResult: any): string {
    const timestamp = new Date().toLocaleString();
    const safeComplaintId = emailData.complaintId || 'NO-ID';
    const safeCallId = callResult?.callId || 'N/A';
    const safeStatus = callResult?.status || 'Unknown';
    const safeResolution = callResult?.resolution || 'No resolution provided';
    const safeNextSteps = callResult?.nextSteps || 'No next steps provided';
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .call-result { background-color: #f0f8ff; padding: 15px; border-radius: 4px; margin: 10px 0; }
        .footer { margin-top: 30px; padding: 15px; background-color: #f5f5f5; border-radius: 4px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h2>Follow-up: Complaint Resolution Update</h2>
        <p><strong>Original Complaint ID:</strong> ${safeComplaintId}</p>
        <p><strong>Call Completed:</strong> ${timestamp}</p>
    </div>

    <div class="call-result">
        <h3>Call Results</h3>
        <p><strong>Call Status:</strong> ${safeStatus}</p>
        <p><strong>Call ID:</strong> ${safeCallId}</p>
        <p><strong>Resolution:</strong> ${safeResolution}</p>
        <p><strong>Next Steps:</strong> ${safeNextSteps}</p>
        ${callResult?.referenceNumber ? `<p><strong>Reference Number:</strong> ${callResult.referenceNumber}</p>` : ''}
        ${callResult?.duration ? `<p><strong>Call Duration:</strong> ${callResult.duration} seconds</p>` : ''}
    </div>

    <p>This is a follow-up to our previous complaint email. We have attempted to contact your customer service team by phone and wanted to provide you with the results.</p>

    <p>Please ensure that the customer receives appropriate follow-up based on the information provided above.</p>

    <div class="footer">
        <p><strong>Automated Follow-up from Complaint Resolution System</strong></p>
        <p>Original Complaint: ${safeComplaintId} | Call: ${safeCallId} | Sent: ${timestamp}</p>
    </div>
</body>
</html>
    `.trim();
  }

  // Additional utility methods
  async getEmailStatus(emailId: string): Promise<any> {
    try {
      const emailDoc = await db.collection('emails').doc(emailId).get();
      return emailDoc.exists ? { id: emailDoc.id, ...emailDoc.data() } : null;
    } catch (error) {
      console.error(chalk.red('Failed to get email status:'), error);
      return null;
    }
  }

  async markEmailAsRead(emailId: string): Promise<void> {
    try {
      await db.collection('emails').doc(emailId).update({
        status: 'read',
        readAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error(chalk.red('Failed to mark email as read:'), error);
    }
  }

  close() {
    console.log(chalk.gray('Email manager closed'));
  }
}

export { EmailManager, EmailResult, ComplaintEmailData };