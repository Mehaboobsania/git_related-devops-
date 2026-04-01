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
  console.log('NotifyCustomer received:', JSON.stringify(event));

  try {
    await connectDB();

    const { orderId, customerId, amount, trackingId } = event;

    if (!orderId || !customerId) {
      throw new Error('orderId and customerId are required');
    }

    // Simulate sending notification (SNS/email)
    console.log(`
      ✅ ORDER CONFIRMATION
      ---------------------
      Order ID:    ${orderId}
      Customer ID: ${customerId}
      Amount:      $${amount}
      Tracking ID: ${trackingId}
      Status:      COMPLETED
    `);

    // Update final order status in MongoDB
    await Order.findOneAndUpdate(
      { orderId },
      { status: 'COMPLETED' },
      { new: true }
    );

    console.log('Notification sent for order:', orderId);

    return {
      ...event,
      status: 'COMPLETED',
      notifiedAt: new Date().toISOString()
    };

  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Notification failed:', message);
    throw new Error(`NotifyFailed: ${message}`);
  }
};

module.exports.handler = handler;