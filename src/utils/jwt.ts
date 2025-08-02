import jwt, { SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { getConfig } from '@/config/env';
import logger from '@/config/logger';

const config = getConfig();

export enum TokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
}

export interface JwtPayload {
  userId: string; // User ID (changed from sub to match tests)
  username?: string;
  email?: string;
  iat?: number;
  exp?: number;
  type: TokenType;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

class JwtService {
  private readonly secretKey: string;
  private readonly accessTokenExpiresIn: string;
  private readonly refreshTokenExpiresIn: string;

  constructor() {
    this.secretKey = config.JWT_SECRET;
    this.accessTokenExpiresIn = config.JWT_ACCESS_TOKEN_EXPIRES_IN;
    this.refreshTokenExpiresIn = config.JWT_REFRESH_TOKEN_EXPIRES_IN;
  }

  /**
   * Generate access and refresh token pair
   */
  public generateTokenPair(payload: Omit<JwtPayload, 'iat' | 'exp' | 'type'>): TokenPair {
    const accessTokenPayload: JwtPayload = {
      ...payload,
      type: TokenType.ACCESS,
    };

    const refreshTokenPayload: JwtPayload = {
      ...payload,
      type: TokenType.REFRESH,
    };

    const accessTokenOptions: SignOptions = {
      expiresIn: this.accessTokenExpiresIn as StringValue,
    };

    const refreshTokenOptions: SignOptions = {
      expiresIn: this.refreshTokenExpiresIn as StringValue,
    };

    const accessToken = jwt.sign(accessTokenPayload, this.secretKey, accessTokenOptions);
    const refreshToken = jwt.sign(refreshTokenPayload, this.secretKey, refreshTokenOptions);

    // Calculate expiration time for access token
    const decodedToken = jwt.decode(accessToken) as JwtPayload;
    const expiresIn = decodedToken.exp! - Math.floor(Date.now() / 1000);

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * Verify and decode JWT token
   */
  public verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.secretKey) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      } else {
        logger.error('JWT verification error', { error });
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Decode JWT token without verification (for expired tokens)
   */
  public decodeToken(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload;
    } catch (error) {
      logger.error('JWT decode error', { error });
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  public isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }
    return Date.now() >= decoded.exp * 1000;
  }

  /**
   * Get token expiration time
   */
  public getTokenExpiration(token: string): Date | null {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return null;
    }
    return new Date(decoded.exp * 1000);
  }

  /**
   * Extract token from Authorization header
   */
  public extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1] || null;
  }
}

// Export singleton instance
export const jwtService = new JwtService();
export default jwtService;

// Convenience functions for tests and backward compatibility
export function generateTokens(userId: string): TokenPair {
  return jwtService.generateTokenPair({ userId });
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  return jwtService.verifyToken(token);
}
