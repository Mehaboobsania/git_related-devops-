const { SFNClient, StartExecutionCommand, DescribeExecutionCommand } = require('@aws-sdk/client-sfn');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const sfnClient = new SFNClient({ region: 'ap-south-1' });

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

const handler = async (event: any) => {
  console.log('API received:', JSON.stringify(event));

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    await connectDB();

    // GET /orders - fetch order history
    if (event.httpMethod === 'GET') {
      const orders = await Order.find({}).sort({ createdAt: -1 }).limit(20);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(orders)
      };
    }

    // POST /orders - place new order
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { customerId, amount } = body;

      if (!customerId || !amount) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'customerId and amount are required' })
        };
      }

      // Generate unique orderId
      const orderId = `ORD-${Date.now()}`;

      // Start Step Functions execution
      const command = new StartExecutionCommand({
        stateMachineArn: process.env.STATE_MACHINE_ARN,
        name: orderId,
        input: JSON.stringify({ orderId, customerId, amount: Number(amount) })
      });

      const execution = await sfnClient.send(command);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          orderId,
          executionArn: execution.executionArn,
          message: 'Order placed successfully!'
        })
      };
    }

  } catch (error: any) {
    console.error('API error:', error.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};

module.exports.handler = handler;