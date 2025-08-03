import crypto from 'crypto';
import logger from '@/config/logger';

interface EncryptionOptions {
  algorithm?: string;
  keyLength?: number;
  ivLength?: number;
}

class EncryptionService {
  private algorithm: string;
  private keyLength: number;
  private ivLength: number;
  private secretKey: string;

  constructor(options: EncryptionOptions = {}) {
    this.algorithm = options.algorithm || 'aes-256-gcm';
    this.keyLength = options.keyLength || 32;
    this.ivLength = options.ivLength || 16;

    // Use SECRET_KEY from environment or generate one
    this.secretKey = process.env.SECRET_KEY || this.generateSecretKey();

    if (this.secretKey.length < this.keyLength) {
      throw new Error(`SECRET_KEY must be at least ${this.keyLength} characters long`);
    }
  }

  /**
   * Generate a random secret key
   */
  private generateSecretKey(): string {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  /**
   * Derive a consistent key from the secret
   */
  private deriveKey(): Buffer {
    return crypto.scryptSync(this.secretKey, 'devpocket-salt', this.keyLength);
  }

  /**
   * Encrypt sensitive data (like kubeconfig)
   */
  encrypt(plaintext: string): string {
    try {
      const key = this.deriveKey();
      const iv = crypto.randomBytes(this.ivLength);

      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // For AES-GCM, get the authentication tag
      let authTag = '';
      if (this.algorithm.includes('gcm')) {
        authTag = (cipher as any).getAuthTag().toString('hex');
      }

      // Combine IV, auth tag, and encrypted data
      const result = iv.toString('hex') + ':' + authTag + ':' + encrypted;

      logger.debug('Data encrypted successfully');
      return result;
    } catch (error) {
      logger.error('Encryption failed', { error });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data (like kubeconfig)
   */
  decrypt(encryptedData: string): string {
    try {
      const key = this.deriveKey();
      const parts = encryptedData.split(':');

      if (parts.length < 2) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0]!, 'hex');
      let authTag: Buffer | undefined;
      let encrypted: string;

      if (this.algorithm.includes('gcm') && parts.length === 3) {
        authTag = Buffer.from(parts[1]!, 'hex');
        encrypted = parts[2]!;
      } else {
        encrypted = parts[1]!;
      }

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);

      if (authTag && this.algorithm.includes('gcm')) {
        (decipher as any).setAuthTag(authTag);
      }

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      logger.debug('Data decrypted successfully');
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed', { error });
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Simple encryption for non-critical data (backwards compatibility)
   */
  encryptSimple(plaintext: string): string {
    try {
      const key = this.deriveKey();
      const iv = crypto.randomBytes(this.ivLength);

      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      logger.error('Simple encryption failed', { error });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Simple decryption for non-critical data (backwards compatibility)
   */
  decryptSimple(encryptedData: string): string {
    try {
      const key = this.deriveKey();
      const parts = encryptedData.split(':');

      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0]!, 'hex');
      const encrypted = parts[1]!;

      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Simple decryption failed', { error });
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Hash data for comparison (one-way)
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verify if a string matches a hash
   */
  verifyHash(data: string, hash: string): boolean {
    return this.hash(data) === hash;
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService();
export default encryptionService;
