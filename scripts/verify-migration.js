#!/usr/bin/env node

/**
 * Database Migration Verification Script
 * Verifies that the last_error column exists in the environments table
 */

const { PrismaClient } = require('@prisma/client');

async function verifyMigration() {
  console.log('🔍 Verifying database migration...');
  
  const prisma = new PrismaClient();
  
  try {
    // Test if we can query the last_error column
    const testQuery = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'environments' AND column_name = 'last_error'
    `;
    
    if (testQuery.length > 0) {
      console.log('✅ SUCCESS: last_error column exists in environments table');
      console.log('📊 Column details:', testQuery[0]);
      
      // Test that we can actually use the column
      const testUpdate = await prisma.environment.findFirst({
        select: { id: true, lastError: true }
      });
      
      console.log('✅ SUCCESS: lastError field is accessible via Prisma');
      console.log('🎉 Migration verification completed successfully!');
      
    } else {
      console.log('❌ FAILED: last_error column does not exist in environments table');
      console.log('❗ The migration was not applied successfully');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ ERROR during verification:', error.message);
    
    if (error.message.includes('last_error')) {
      console.log('💡 This confirms the column is missing - please run the migration');
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyMigration().catch((error) => {
  console.error('❌ Verification script failed:', error);
  process.exit(1);
});