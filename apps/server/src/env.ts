import 'dotenv/config';

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  JWT_SECRET: process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET env var is required'); })(),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  HOST: process.env.HOST || '0.0.0.0',
  PORT: parseInt(process.env.PORT || '4000', 10),
  CORS_ORIGINS: process.env.CORS_ORIGINS || '*',
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || '',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  MAX_NEW_CONVERSATIONS_PER_DAY: parseInt(process.env.MAX_NEW_CONVERSATIONS_PER_DAY || '20', 10),
  MAX_FIRST_CONTACT_PER_DAY: parseInt(process.env.MAX_FIRST_CONTACT_PER_DAY || '5', 10),
};
