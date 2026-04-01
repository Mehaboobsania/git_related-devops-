const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customerId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'VALIDATING' },
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is required');
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
}

const handler = async (event: any) => {
  console.log('FulfilOrder received:', JSON.stringify(event));

  try {
    await connectDB();

    const { orderId, customerId } = event;

    if (!orderId || !customerId) {
      throw new Error('orderId and customerId are required');
    }

    // Simulate warehouse fulfilment
    const trackingId = `TRACK-${Date.now()}`;

    // Update order status in MongoDB
    await Order.findOneAndUpdate(
      { orderId },
      { status: 'FULFILLED' },
      { new: true }
    );

    console.log('Order fulfilled:', orderId);

    return {
      ...event,
      status: 'FULFILLED',
      trackingId
    };

  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Fulfilment failed:', message);
    throw new Error(`FulfilFailed: ${message}`);
  }
};

module.exports.handler = handler;