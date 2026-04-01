const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Order schema
const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customerId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'VALIDATING' },
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

// Connect to MongoDB
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is required');
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
}

// Lambda handler
const handler = async (event: any) => {
  console.log('ChargePayment received:', JSON.stringify(event));

  try {
    await connectDB();

    // Simulate payment processing
    const { orderId, amount } = event;

    if (!orderId || !amount) {
      throw new Error('orderId and amount are required');
    }

    // Simulate payment gateway call
    const paymentSuccess = amount > 0 && amount < 10000;

    if (!paymentSuccess) {
      throw new Error(`Payment failed for amount: ${amount}`);
    }

    // Update order status in MongoDB
    await Order.findOneAndUpdate(
      { orderId },
      { status: 'CHARGED' },
      { new: true }
    );

    console.log('Payment charged for order:', orderId);

    return {
      ...event,
      status: 'CHARGED',
      paymentId: `PAY-${Date.now()}`
    };

  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Charge failed:', message);
    throw new Error(`ChargeFailed: ${message}`);
  }
};

module.exports.handler = handler;