const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI is missing from .env');
  }

  console.log('Connecting to MongoDB Atlas...');

  await mongoose.connect(uri, {
    family: 4,
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
  });

  console.log('MongoDB Connected ✅');
};

module.exports = connectDB;