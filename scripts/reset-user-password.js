import 'dotenv/config';
import { supabaseClient } from '../config/database.js';
import { hashPassword } from '../utils/auth.js';

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('Usage: node scripts/reset-user-password.js <email> <new-password>');
  process.exit(1);
}

async function resetPassword() {
  try {
    console.log(`\n🔄 Resetting password for: ${email}\n`);

    // Find user by email
    const { data: user, error: findError } = await supabaseClient
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('email', email)
      .is('deleted_at', null)
      .single();

    if (findError || !user) {
      console.error('❌ User not found:', email);
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.first_name} ${user.last_name} (${user.email})`);

    // Hash the new password
    console.log('🔐 Hashing new password...');
    const password_hash = await hashPassword(newPassword);

    // Update password
    const { error: updateError } = await supabaseClient
      .from('users')
      .update({ password_hash })
      .eq('id', user.id);

    if (updateError) {
      console.error('❌ Error updating password:', updateError);
      process.exit(1);
    }

    console.log('✅ Password reset successfully!');
    console.log(`\nUser: ${user.email}`);
    console.log(`New password: ${newPassword}\n`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetPassword();

