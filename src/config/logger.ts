import winston from 'winston';
import { getConfig } from './env';

const config = getConfig();

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  config.LOG_FORMAT === 'json'
    ? winston.format.json()
    : winston.format.simple()
);

const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: logFormat,
  defaultMeta: { service: config.APP_NAME },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.simple()
      ),
    }),
  ],
});

// Add file transports in production
if (config.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.json(),
    })
  );
  
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.json(),
    })
  );
}

// Create a stream object for Morgan HTTP request logging
export const logStream = {
  write: (message: string): void => {
    logger.info(message.trim());
  },
};

export default logger;
