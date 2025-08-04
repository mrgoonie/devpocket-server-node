// Global test teardown - runs once after all tests
import fs from 'fs';
import path from 'path';

export default async function globalTeardown() {
  console.log('🧹 Cleaning up global test environment...');

  // Clean up SQLite test database if it exists
  const testDbPath = path.join(__dirname, 'test.db');
  if (fs.existsSync(testDbPath)) {
    try {
      fs.unlinkSync(testDbPath);
      console.log('✅ Test database cleaned up');
    } catch (error) {
      console.log('⚠️  Failed to clean up test database:', error);
    }
  }

  // Clean up any temporary test files
  const tempFiles = [
    path.join(__dirname, 'test.db-journal'),
    path.join(__dirname, 'test.db-wal'),
    path.join(__dirname, 'test.db-shm'),
  ];

  tempFiles.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  console.log('✅ Global test teardown completed');
}