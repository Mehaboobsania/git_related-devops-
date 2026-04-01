const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customerId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'VALIDATING' },
  createdAt: { type: Date, default: Date.now }
}, {
  optimisticConcurrency: true
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

const orderValidator = z.object({
  orderId: z.string().min(1),
  customerId: z.string().min(1),
  amount: z.number().positive()
});

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is required');
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  }
}

function getPayloadFromEvent(event: any) {
  if (event == null) return event;
  if (typeof event.body === 'string') return JSON.parse(event.body);
  if (typeof event.body !== 'undefined') return event.body;
  return event;
}

const handler = async (event: any) => {
  console.log('ValidateOrder received:', JSON.stringify(event));

  try {
    const payload = getPayloadFromEvent(event);
    const validated = orderValidator.parse(payload);

    await connectDB();

    // findOneAndUpdate with upsert = atomic operation
    // safe for concurrent requests
    await Order.findOneAndUpdate(
      { orderId: validated.orderId },
      {
        $setOnInsert: {
          orderId: validated.orderId,
          customerId: validated.customerId,
          amount: validated.amount,
          status: 'VALIDATED',
          createdAt: new Date()
        }
      },
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );

    console.log('Order validated and saved:', validated.orderId);
    return { ...validated, status: 'VALIDATED' };

  } catch (error: any) {
    if (error.code === 11000) {
      throw new Error(`ValidationFailed: Duplicate order - already being processed`);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error('Validation failed:', message);
    throw new Error(`ValidationFailed: ${message}`);
  }
};

module.exports.handler = handler;