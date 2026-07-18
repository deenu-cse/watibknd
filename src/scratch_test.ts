import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { User } from './models/User';

dotenv.config();

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set in env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const users = await User.find({});
  console.log("Users in DB:", users.map(u => ({ email: u.email, name: u.name })));
  
  if (users.length > 0) {
    const user = users[0];
    const rawToken = '6154dfe02632775296d6f10b4e10463b687afec1772a337c7ca3f35d5b7e8b95';
    user.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expires
    await user.save({ validateBeforeSave: false });
    console.log(`Successfully set reset token for ${user.email}`);
    console.log(`Raw Token: ${rawToken}`);
    console.log(`Reset URL: http://localhost:3000/reset-password/${rawToken}`);
  } else {
    console.log("No users found in the database. Please register a user first on the frontend at http://localhost:3000/register");
  }
  await mongoose.disconnect();
}

run().catch(console.error);
