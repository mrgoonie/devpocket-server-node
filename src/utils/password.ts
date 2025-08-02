import bcrypt from 'bcryptjs';
import { getConfig } from '@/config/env';
import logger from '@/config/logger';

const config = getConfig();

class PasswordService {
  private readonly saltRounds: number;

  constructor() {
    this.saltRounds = config.BCRYPT_ROUNDS;
  }

  /**
   * Hash a password using bcrypt
   */
  public async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, this.saltRounds);
    } catch (error) {
      logger.error('Password hashing failed', { error });
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Verify a password against its hash
   */
  public async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Password verification failed', { error });
      return false;
    }
  }

  /**
   * Validate password strength
   */
  public validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Minimum length
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    // Maximum length
    if (password.length > 128) {
      errors.push('Password must be less than 128 characters');
    }

    // Must contain lowercase letter
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    // Must contain uppercase letter
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    // Must contain number
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    // Must contain special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Common password patterns (basic check)
    const commonPatterns = [
      /^password/i,
      /^123456/,
      /^admin/i,
      /^qwerty/i,
      /^letmein/i,
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        errors.push('Password is too common, please choose a stronger password');
        break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate a random password
   */
  public generateRandomPassword(length: number = 16): string {
    const charset = {
      lowercase: 'abcdefghijklmnopqrstuvwxyz',
      uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      numbers: '0123456789',
      symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    };

    let password = '';
    const allChars = Object.values(charset).join('');

    // Ensure at least one character from each category
    password += this.getRandomChar(charset.lowercase);
    password += this.getRandomChar(charset.uppercase);
    password += this.getRandomChar(charset.numbers);
    password += this.getRandomChar(charset.symbols);

    // Fill the rest with random characters
    for (let i = password.length; i < length; i++) {
      password += this.getRandomChar(allChars);
    }

    // Shuffle the password
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }

  private getRandomChar(charset: string): string {
    return charset.charAt(Math.floor(Math.random() * charset.length));
  }
}

// Export singleton instance
export const passwordService = new PasswordService();
export default passwordService;

// Convenience functions for tests and backward compatibility
export async function hashPassword(password: string): Promise<string> {
  return passwordService.hashPassword(password);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return passwordService.verifyPassword(password, hash);
}
