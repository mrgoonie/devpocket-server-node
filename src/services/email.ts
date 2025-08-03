import { Resend } from 'resend';
import { getConfig } from '@/config/env';
import logger from '@/config/logger';

const config = getConfig();
const resend = new Resend(config.RESEND_API_KEY);

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailVerificationOptions {
  to: string;
  username: string;
  verificationUrl: string;
}

interface PasswordResetOptions {
  to: string;
  username: string;
  resetUrl: string;
}

interface WelcomeEmailOptions {
  to: string;
  username: string;
}

interface EnvironmentNotificationOptions {
  to: string;
  username: string;
  environmentName: string;
  action: 'created' | 'started' | 'stopped' | 'deleted' | 'error';
  details?: string;
}

class EmailService {
  private readonly fromEmail: string;
  private readonly appName: string;
  private readonly baseUrl: string;

  constructor() {
    this.fromEmail = config.FROM_EMAIL || 'DevPocket <noreply@devpocket.app>';
    this.appName = 'DevPocket';
    this.baseUrl = config.BASE_URL;
  }

  /**
   * Send a generic email
   */
  async sendEmail(
    options: EmailOptions
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { data, error } = await resend.emails.send({
        from: this.fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
        ...(options.text && { text: options.text }),
      });

      if (error) {
        logger.error('Failed to send email', { error, to: options.to, subject: options.subject });
        return { success: false, error: error.message };
      }

      logger.info('Email sent successfully', {
        messageId: data?.id,
        to: options.to,
        subject: options.subject,
      });

      return {
        success: true,
        ...(data?.id && { messageId: data.id }),
      };
    } catch (error) {
      logger.error('Email service error', { error, to: options.to, subject: options.subject });
      return { success: false, error: String(error) };
    }
  }

  /**
   * Send email verification email
   */
  async sendEmailVerification(
    options: EmailVerificationOptions
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const html = this.generateEmailVerificationHtml(options);
    const text = this.generateEmailVerificationText(options);

    return this.sendEmail({
      to: options.to,
      subject: `Verify your ${this.appName} account`,
      html,
      text,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(
    options: PasswordResetOptions
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const html = this.generatePasswordResetHtml(options);
    const text = this.generatePasswordResetText(options);

    return this.sendEmail({
      to: options.to,
      subject: `Reset your ${this.appName} password`,
      html,
      text,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(
    options: WelcomeEmailOptions
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const html = this.generateWelcomeEmailHtml(options);
    const text = this.generateWelcomeEmailText(options);

    return this.sendEmail({
      to: options.to,
      subject: `Welcome to ${this.appName}!`,
      html,
      text,
    });
  }

  /**
   * Send environment notification email
   */
  async sendEnvironmentNotification(
    options: EnvironmentNotificationOptions
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const html = this.generateEnvironmentNotificationHtml(options);
    const text = this.generateEnvironmentNotificationText(options);

    const actionTexts = {
      created: 'Environment Created',
      started: 'Environment Started',
      stopped: 'Environment Stopped',
      deleted: 'Environment Deleted',
      error: 'Environment Error',
    };

    return this.sendEmail({
      to: options.to,
      subject: `${this.appName}: ${actionTexts[options.action]} - ${options.environmentName}`,
      html,
      text,
    });
  }

  // HTML Email Templates

  private generateEmailVerificationHtml(options: EmailVerificationOptions): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${this.appName}</h1>
          </div>
          <div class="content">
            <h2>Verify Your Email Address</h2>
            <p>Hello ${options.username},</p>
            <p>Thank you for signing up for ${this.appName}! To complete your registration and start using our cloud IDE platform, please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
              <a href="${options.verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>If the button above doesn't work, you can also copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #e2e8f0; padding: 10px; border-radius: 4px; font-family: monospace;">
              ${options.verificationUrl}
            </p>
            <p>This verification link will expire in 24 hours for security reasons.</p>
            <p>If you didn't create an account with ${this.appName}, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The ${this.appName} Team</p>
            <p><small>This is an automated message, please do not reply to this email.</small></p>
          </div>
        </body>
      </html>
    `;
  }

  private generatePasswordResetHtml(options: PasswordResetOptions): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #666; }
            .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${this.appName}</h1>
          </div>
          <div class="content">
            <h2>Reset Your Password</h2>
            <p>Hello ${options.username},</p>
            <p>We received a request to reset the password for your ${this.appName} account. If you made this request, click the button below to set a new password:</p>
            <p style="text-align: center;">
              <a href="${options.resetUrl}" class="button">Reset Password</a>
            </p>
            <p>If the button above doesn't work, you can also copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #e2e8f0; padding: 10px; border-radius: 4px; font-family: monospace;">
              ${options.resetUrl}
            </p>
            <div class="warning">
              <strong>Security Notice:</strong>
              <ul>
                <li>This password reset link will expire in 1 hour</li>
                <li>If you didn't request a password reset, please ignore this email</li>
                <li>Your password will remain unchanged until you click the link above</li>
              </ul>
            </div>
            <p>For security reasons, we recommend using a strong, unique password that you don't use for other accounts.</p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The ${this.appName} Team</p>
            <p><small>This is an automated message, please do not reply to this email.</small></p>
          </div>
        </body>
      </html>
    `;
  }

  private generateWelcomeEmailHtml(options: WelcomeEmailOptions): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to ${this.appName}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #666; }
            .feature { background: white; padding: 20px; margin: 15px 0; border-radius: 6px; border-left: 4px solid #10b981; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Welcome to ${this.appName}!</h1>
          </div>
          <div class="content">
            <h2>Hello ${options.username}! 👋</h2>
            <p>Welcome to ${this.appName}, the mobile-first cloud IDE that lets you code anywhere, anytime! We're excited to have you on board.</p>
            
            <h3>What can you do with ${this.appName}?</h3>
            
            <div class="feature">
              <h4>🚀 Create Development Environments</h4>
              <p>Spin up containerized development environments with pre-configured templates for Python, Node.js, Go, and more.</p>
            </div>
            
            <div class="feature">
              <h4>💻 Code on Mobile</h4>
              <p>Access your development environments from any device with our mobile-optimized interface and terminal.</p>
            </div>
            
            <div class="feature">
              <h4>☁️ Cloud-Native</h4>
              <p>Your code and environments are safely stored in the cloud with automatic backups and persistent storage.</p>
            </div>
            
            <div class="feature">
              <h4>⚡ Instant Setup</h4>
              <p>Get coding in seconds with our pre-built templates and instant environment provisioning.</p>
            </div>
            
            <p style="text-align: center;">
              <a href="${this.baseUrl}/dashboard" class="button">Get Started</a>
            </p>
            
            <h3>Need Help?</h3>
            <p>Check out our documentation and guides:</p>
            <ul>
              <li><a href="${this.baseUrl}/docs/getting-started">Getting Started Guide</a></li>
              <li><a href="${this.baseUrl}/docs/templates">Available Templates</a></li>
              <li><a href="${this.baseUrl}/docs/mobile">Mobile Development Tips</a></li>
              <li><a href="${this.baseUrl}/support">Contact Support</a></li>
            </ul>
          </div>
          <div class="footer">
            <p>Happy coding!<br>The ${this.appName} Team</p>
            <p><small>This is an automated message, please do not reply to this email.</small></p>
          </div>
        </body>
      </html>
    `;
  }

  private generateEnvironmentNotificationHtml(options: EnvironmentNotificationOptions): string {
    const actionColors = {
      created: '#10b981',
      started: '#3b82f6',
      stopped: '#f59e0b',
      deleted: '#ef4444',
      error: '#dc2626',
    };

    const actionEmojis = {
      created: '🚀',
      started: '▶️',
      stopped: '⏸️',
      deleted: '🗑️',
      error: '❌',
    };

    const color = actionColors[options.action];
    const emoji = actionEmojis[options.action];

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Environment ${options.action}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${color}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #666; }
            .env-info { background: white; padding: 20px; margin: 15px 0; border-radius: 6px; border-left: 4px solid ${color}; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${this.appName}</h1>
          </div>
          <div class="content">
            <h2>${emoji} Environment ${options.action.charAt(0).toUpperCase() + options.action.slice(1)}</h2>
            <p>Hello ${options.username},</p>
            <p>Your development environment has been ${options.action}.</p>
            
            <div class="env-info">
              <h4>Environment Details</h4>
              <p><strong>Name:</strong> ${options.environmentName}</p>
              <p><strong>Action:</strong> ${options.action.charAt(0).toUpperCase() + options.action.slice(1)}</p>
              <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              ${options.details ? `<p><strong>Details:</strong> ${options.details}</p>` : ''}
            </div>
            
            <p style="text-align: center;">
              <a href="${this.baseUrl}/environments" class="button">View Environments</a>
            </p>
          </div>
          <div class="footer">
            <p>Best regards,<br>The ${this.appName} Team</p>
            <p><small>This is an automated message, please do not reply to this email.</small></p>
          </div>
        </body>
      </html>
    `;
  }

  // Text Email Templates (fallback for email clients that don't support HTML)

  private generateEmailVerificationText(options: EmailVerificationOptions): string {
    return `
Verify Your Email Address

Hello ${options.username},

Thank you for signing up for ${this.appName}! To complete your registration and start using our cloud IDE platform, please verify your email address by visiting this link:

${options.verificationUrl}

This verification link will expire in 24 hours for security reasons.

If you didn't create an account with ${this.appName}, you can safely ignore this email.

Best regards,
The ${this.appName} Team

This is an automated message, please do not reply to this email.
    `.trim();
  }

  private generatePasswordResetText(options: PasswordResetOptions): string {
    return `
Reset Your Password

Hello ${options.username},

We received a request to reset the password for your ${this.appName} account. If you made this request, visit this link to set a new password:

${options.resetUrl}

Security Notice:
- This password reset link will expire in 1 hour
- If you didn't request a password reset, please ignore this email
- Your password will remain unchanged until you click the link above

For security reasons, we recommend using a strong, unique password that you don't use for other accounts.

Best regards,
The ${this.appName} Team

This is an automated message, please do not reply to this email.
    `.trim();
  }

  private generateWelcomeEmailText(options: WelcomeEmailOptions): string {
    return `
Welcome to ${this.appName}!

Hello ${options.username}!

Welcome to ${this.appName}, the mobile-first cloud IDE that lets you code anywhere, anytime! We're excited to have you on board.

What can you do with ${this.appName}?

🚀 Create Development Environments
Spin up containerized development environments with pre-configured templates for Python, Node.js, Go, and more.

💻 Code on Mobile
Access your development environments from any device with our mobile-optimized interface and terminal.

☁️ Cloud-Native
Your code and environments are safely stored in the cloud with automatic backups and persistent storage.

⚡ Instant Setup
Get coding in seconds with our pre-built templates and instant environment provisioning.

Get started: ${this.baseUrl}/dashboard

Need Help?
Check out our documentation and guides:
- Getting Started Guide: ${this.baseUrl}/docs/getting-started
- Available Templates: ${this.baseUrl}/docs/templates
- Mobile Development Tips: ${this.baseUrl}/docs/mobile
- Contact Support: ${this.baseUrl}/support

Happy coding!
The ${this.appName} Team

This is an automated message, please do not reply to this email.
    `.trim();
  }

  private generateEnvironmentNotificationText(options: EnvironmentNotificationOptions): string {
    const actionEmojis = {
      created: '🚀',
      started: '▶️',
      stopped: '⏸️',
      deleted: '🗑️',
      error: '❌',
    };

    const emoji = actionEmojis[options.action];

    return `
${emoji} Environment ${options.action.charAt(0).toUpperCase() + options.action.slice(1)}

Hello ${options.username},

Your development environment has been ${options.action}.

Environment Details:
- Name: ${options.environmentName}
- Action: ${options.action.charAt(0).toUpperCase() + options.action.slice(1)}
- Time: ${new Date().toLocaleString()}
${options.details ? `- Details: ${options.details}` : ''}

View your environments: ${this.baseUrl}/environments

Best regards,
The ${this.appName} Team

This is an automated message, please do not reply to this email.
    `.trim();
  }
}

export const emailService = new EmailService();
export default emailService;
