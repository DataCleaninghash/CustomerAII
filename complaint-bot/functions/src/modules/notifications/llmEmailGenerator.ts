import OpenAI from 'openai';
import chalk from 'chalk';

interface EmailGenerationContext {
  complaintData: {
    originalComplaint: string;
    extractedFields: any;
    conversationHistory: any[];
  };
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
  priority: 'high' | 'medium' | 'low';
  emailType: 'initial' | 'followup' | 'escalation';
  callResult?: any;
}

interface GeneratedEmailContent {
  subject: string;
  htmlContent: string;
  plainTextContent: string;
  tone: string;
  estimatedResponseTime: string;
  suggestedFollowUpActions: string[];
}

class LLMEmailGenerator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateComplaintEmail(context: EmailGenerationContext): Promise<GeneratedEmailContent> {
    try {
      console.log(chalk.blue('🤖 Generating personalized email content using AI...'));

      const prompt = this.buildEmailGenerationPrompt(context);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3, // Lower temperature for more consistent, professional output
        max_tokens: 2000
      });

      const aiResponse = response.choices[0].message.content;
      if (!aiResponse) {
        throw new Error('No response from AI');
      }

      // Parse the structured response
      const parsedContent = this.parseAIResponse(aiResponse);
      
      // Generate HTML version from the content
      const htmlContent = this.convertToHTML(parsedContent, context);

      console.log(chalk.green('✓ AI-generated email content created'));

      return {
        subject: parsedContent.subject,
        htmlContent: htmlContent,
        plainTextContent: parsedContent.content,
        tone: parsedContent.tone,
        estimatedResponseTime: parsedContent.estimatedResponseTime,
        suggestedFollowUpActions: parsedContent.followUpActions
      };

    } catch (error) {
      console.error(chalk.red('Error generating AI email content:'), error);
      
      // Fallback to template-based approach
      console.log(chalk.yellow('Falling back to template-based email generation...'));
      return this.generateFallbackEmail(context);
    }
  }

  private getSystemPrompt(): string {
    return `
You are an expert customer service advocate and professional business correspondence writer. Your role is to craft compelling, professional complaint emails that get results.

EXPERTISE AREAS:
- Customer service best practices
- Business communication psychology
- Legal considerations for complaints
- Company-specific approach strategies
- Escalation tactics

YOUR WRITING STYLE SHOULD BE:
- Professional but empathetic
- Clear and structured
- Persuasive without being aggressive
- Fact-based and specific
- Action-oriented

RESPONSE FORMAT:
You must respond with a JSON object containing:
{
  "subject": "Professional email subject line",
  "content": "Full email content in professional business format",
  "tone": "Description of the tone used (formal/professional/urgent/etc)",
  "estimatedResponseTime": "Realistic expectation for company response",
  "followUpActions": ["action1", "action2", "action3"],
  "keyStrategies": ["strategy1", "strategy2"]
}

IMPORTANT GUIDELINES:
1. Reference specific details from the complaint
2. Include clear desired outcomes
3. Mention relevant consumer rights when appropriate
4. Use company-appropriate language and tone
5. Include escalation paths if needed
6. Be concise but comprehensive
7. Always maintain professional courtesy
    `;
  }

  private buildEmailGenerationPrompt(context: EmailGenerationContext): string {
    const { complaintData, userDetails, priority, emailType, callResult } = context;
    
    // Defensive programming - ensure all data exists with proper defaults
    const companyInfo = context.companyInfo || { 
      name: 'Unknown Company',
      emails: [],
      industry: undefined,
      knownPolicies: undefined
    };
    
    const safeCompanyName = companyInfo.name || 'Unknown Company';
    const safeIndustry = companyInfo.industry || 'Unknown';
    const safePolicies = companyInfo.knownPolicies?.join(', ') || 'None specified';
    
    // Safe user details
    const safeUserName = userDetails?.name || 'Unknown Customer';
    const safeUserEmail = userDetails?.email || 'no-email@example.com';
    const safeUserPhone = userDetails?.phone || 'No phone provided';
    
    // Safe complaint data
    const safeOriginalComplaint = complaintData?.originalComplaint || 'No complaint details provided';
    const safeIssue = complaintData?.extractedFields?.issue || 'General complaint';
    const safeProduct = complaintData?.extractedFields?.product || 'Not specified';
    const safeDateOfIssue = complaintData?.extractedFields?.date || 'Recently';
    const safeResolution = complaintData?.extractedFields?.resolution || 'Fair resolution';
    const safeConversationHistory = complaintData?.conversationHistory || [];

    return `
Generate a ${priority} priority ${emailType} complaint email for the following situation:

COMPANY INFORMATION:
- Name: ${safeCompanyName}
- Industry: ${safeIndustry}
- Known Policies: ${safePolicies}

CUSTOMER DETAILS:
- Name: ${safeUserName}
- Email: ${safeUserEmail}
- Phone: ${safeUserPhone}

COMPLAINT INFORMATION:
- Original Complaint: "${safeOriginalComplaint}"
- Issue Type: ${safeIssue}
- Product/Service: ${safeProduct}
- Date of Issue: ${safeDateOfIssue}
- Desired Resolution: ${safeResolution}

${safeConversationHistory.length > 0 ? `
ADDITIONAL DETAILS FROM FOLLOW-UP QUESTIONS:
${safeConversationHistory.map((qa: any) => `Q: ${qa.question || 'No question'}\nA: ${qa.answer || 'No answer'}`).join('\n\n')}
` : ''}

${callResult ? `
PREVIOUS CALL ATTEMPT:
- Call Status: ${callResult.status || 'Unknown'}
- Call Result: ${callResult.resolution || 'No resolution'}
- Reference Number: ${callResult.referenceNumber || 'None provided'}
- Next Steps from Call: ${callResult.nextSteps || 'None specified'}
` : ''}

EMAIL TYPE SPECIFIC INSTRUCTIONS:
${emailType === 'initial' ? `
This is the first contact with the company. Focus on:
- Clear problem statement
- Specific details and timeline
- Professional but assertive tone
- Clear desired resolution
- Reference to consumer rights if applicable
` : emailType === 'followup' ? `
This is a follow-up email after a phone call. Focus on:
- Reference the previous call and any reference numbers
- Summarize what was discussed
- Clarify any remaining issues
- Request written confirmation of resolution steps
- Set clear timeline expectations
` : `
This is an escalation email. Focus on:
- Previous attempts to resolve (email and call)
- Escalation to management/supervisors
- More formal tone with legal implications if appropriate
- Clear deadline for resolution
- Mention of alternative dispute resolution if needed
`}

PRIORITY LEVEL GUIDANCE:
${priority === 'high' ? `
HIGH PRIORITY: Use urgent but professional language. Emphasize time sensitivity, potential safety issues, financial impact, or legal implications.
` : priority === 'medium' ? `
MEDIUM PRIORITY: Professional and direct. Focus on inconvenience caused and reasonable resolution timeline.
` : `
LOW PRIORITY: Polite and courteous. Focus on improvement and future prevention.
`}

COMPANY-SPECIFIC APPROACH:
Research-based approach for ${safeCompanyName}:
${this.getCompanySpecificGuidance(safeCompanyName)}

Generate an email that maximizes the likelihood of a positive response from ${safeCompanyName}'s customer service team.
    `;
  }

  private getCompanySpecificGuidance(companyName: string | undefined): string {
    const safeCompanyName = companyName || 'Unknown Company';
    const companyLower = safeCompanyName.toLowerCase();
    
    if (companyLower.includes('amazon')) {
      return `
- Amazon responds well to specific order numbers and dates
- Reference their A-to-Z guarantee when applicable
- Mention Prime membership status if relevant
- Use their case reference system
- Professional tone works best`;
    } else if (companyLower.includes('apple')) {
      return `
- Apple values detailed technical descriptions
- Reference warranty status and purchase dates
- Mention Apple Care if applicable
- Professional, tech-savvy language preferred
- Reference specific product models and serial numbers`;
    } else if (companyLower.includes('bank') || companyLower.includes('financial')) {
      return `
- Financial institutions require formal, legal-aware language
- Reference specific account numbers and transaction IDs
- Mention relevant banking regulations (CFPB, etc.)
- Include specific dates and amounts
- Professional, formal tone essential`;
    } else {
      return `
- Use professional business communication standards
- Include specific details, dates, and reference numbers
- Maintain courteous but firm tone
- Focus on resolution-oriented language`;
    }
  }

  private parseAIResponse(aiResponse: string): any {
    try {
      // Try to parse as JSON first
      return JSON.parse(aiResponse);
    } catch (error) {
      // If JSON parsing fails, try to extract structured data
      console.log(chalk.yellow('AI response not in JSON format, attempting to parse...'));
      
      return {
        subject: this.extractSection(aiResponse, 'subject') || 'Customer Service Complaint',
        content: this.extractSection(aiResponse, 'content') || aiResponse,
        tone: this.extractSection(aiResponse, 'tone') || 'professional',
        estimatedResponseTime: this.extractSection(aiResponse, 'estimatedResponseTime') || '3-5 business days',
        followUpActions: this.extractList(aiResponse, 'followUpActions') || ['Wait for response', 'Follow up if no response in 5 days'],
        keyStrategies: this.extractList(aiResponse, 'keyStrategies') || ['Professional communication']
      };
    }
  }

  private extractSection(text: string, section: string): string | null {
    const patterns = [
      new RegExp(`"${section}":\\s*"([^"]+)"`, 'i'),
      new RegExp(`${section}:\\s*(.+?)(?=\\n|$)`, 'i'),
      new RegExp(`\\*\\*${section}\\*\\*:?\\s*(.+?)(?=\\n|$)`, 'i')
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  private extractList(text: string, section: string): string[] | null {
    const listPattern = new RegExp(`"${section}":\\s*\\[(.*?)\\]`, 'i');
    const match = text.match(listPattern);
    
    if (match) {
      try {
        return JSON.parse(`[${match[1]}]`);
      } catch {
        return match[1].split(',').map(item => item.trim().replace(/"/g, ''));
      }
    }
    return null;
  }

  private convertToHTML(parsedContent: any, context: EmailGenerationContext): string {
    const timestamp = new Date().toLocaleString();
    const priorityClass = `priority-${context.priority || 'medium'}`;
    
    // Defensive checks for all values
    const safeCompanyName = context.companyInfo?.name || 'Unknown Company';
    const safeUserName = context.userDetails?.name || 'Unknown Customer';
    const safeUserEmail = context.userDetails?.email || 'no-email@example.com';
    const safeUserPhone = context.userDetails?.phone || 'No phone provided';
    const safePriority = context.priority || 'medium';
    const safeEmailType = context.emailType || 'initial';
    const safeTone = parsedContent.tone || 'professional';
    const safeResponseTime = parsedContent.estimatedResponseTime || '3-5 business days';
    const safeFollowUpActions = parsedContent.followUpActions || ['Wait for response'];
    const safeContent = parsedContent.content || 'Email content could not be generated';
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
        .header { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #2196f3; }
        .priority-high { color: #d32f2f; font-weight: bold; }
        .priority-medium { color: #f57c00; font-weight: bold; }
        .priority-low { color: #388e3c; font-weight: bold; }
        .content { background-color: #ffffff; padding: 20px; border-radius: 4px; }
        .signature { margin-top: 30px; padding: 15px; background-color: #f5f5f5; border-radius: 4px; font-size: 12px; }
        .customer-info { background-color: #e3f2fd; padding: 15px; border-radius: 4px; margin: 15px 0; }
        .ai-indicator { font-style: italic; color: #666; font-size: 11px; margin-top: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h2>Customer Service Inquiry - ${safeCompanyName}</h2>
        <p><strong>Priority:</strong> <span class="${priorityClass}">${safePriority.toUpperCase()}</span></p>
        <p><strong>Email Type:</strong> ${safeEmailType}</p>
        <p><strong>Generated:</strong> ${timestamp}</p>
    </div>

    <div class="customer-info">
        <h3>Customer Information</h3>
        <p><strong>Name:</strong> ${safeUserName}</p>
        <p><strong>Email:</strong> ${safeUserEmail}</p>
        <p><strong>Phone:</strong> ${safeUserPhone}</p>
    </div>

    <div class="content">
        ${safeContent.replace(/\n/g, '<br>')}
    </div>

    <div class="signature">
        <p><strong>Communication Details:</strong></p>
        <p>Tone: ${safeTone}</p>
        <p>Expected Response Time: ${safeResponseTime}</p>
        <p>Follow-up Actions: ${safeFollowUpActions.join(', ')}</p>
        
        <div class="ai-indicator">
            <p>This email was generated using AI to ensure professional communication and optimal resolution likelihood.</p>
            <p>Generated: ${timestamp} | Customer: ${safeUserName}</p>
        </div>
    </div>
</body>
</html>
    `.trim();
  }

  private generateFallbackEmail(context: EmailGenerationContext): GeneratedEmailContent {
    // Defensive checks for all values
    const safeCompanyName = context.companyInfo?.name || 'Unknown Company';
    const safeUserName = context.userDetails?.name || 'Unknown Customer';
    const safeUserEmail = context.userDetails?.email || 'no-email@example.com';
    const safeUserPhone = context.userDetails?.phone || 'No phone provided';
    const safeIssue = context.complaintData?.extractedFields?.issue || 'General Issue';
    const safeProduct = context.complaintData?.extractedFields?.product || 'your services';
    const safeComplaint = context.complaintData?.originalComplaint || 'I have a concern that needs to be addressed.';
    
    const subject = `Customer Service Inquiry - ${safeIssue}`;
    const content = `
Dear ${safeCompanyName} Customer Service Team,

I am writing to formally address a concern regarding ${safeProduct}.

${safeComplaint}

I would appreciate your prompt attention to this matter and look forward to a swift resolution.

Best regards,
${safeUserName}
${safeUserEmail}
${safeUserPhone}
    `.trim();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .content { background-color: #f9f9f9; padding: 20px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="content">
        ${content.replace(/\n/g, '<br>')}
    </div>
</body>
</html>
    `.trim();

    return {
      subject,
      htmlContent: htmlContent,
      plainTextContent: content,
      tone: 'professional',
      estimatedResponseTime: '3-5 business days',
      suggestedFollowUpActions: ['Wait for response', 'Follow up in 5 days']
    };
  }
}

export { LLMEmailGenerator, EmailGenerationContext, GeneratedEmailContent };