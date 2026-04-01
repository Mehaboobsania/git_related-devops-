import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'https://hetzrz0s79.execute-api.ap-south-1.amazonaws.com/prod';

interface Order {
  _id: string;
  orderId: string;
  customerId: string;
  amount: number;
  status: string;
  createdAt: string;
}

function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/orders`);
      setOrders(res.data);
    } catch (err) {
      setError('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const placeOrder = async () => {
    if (!customerId || !amount) {
      setError('Please fill in all fields');
      return;
    }
    setPlacing(true);
    setMessage('');
    setError('');
    try {
      const res = await axios.post(`${API_URL}/orders`, {
        customerId,
        amount: parseFloat(amount)
      });
      setMessage(`✅ Order placed! ID: ${res.data.orderId}`);
      setCustomerId('');
      setAmount('');
      setTimeout(fetchOrders, 3000);
    } catch (err: any) {
      setError('Failed to place order: ' + err.message);
    } finally {
      setPlacing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#22c55e';
      case 'VALIDATED': return '#3b82f6';
      case 'CHARGED': return '#8b5cf6';
      case 'FULFILLED': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'Arial, sans-serif' }}>
      
      {/* Header */}
      <div style={{ background: '#1e293b', padding: '20px 40px', borderBottom: '1px solid #334155' }}>
        <h1 style={{ margin: 0, fontSize: '24px', color: '#60a5fa' }}>🛒 Order Workflow Dashboard</h1>
        <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '14px' }}>AWS Step Functions + Lambda + MongoDB Atlas</p>
      </div>

      <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '40px' }}>
          {[
            { label: 'Total Orders', value: orders.length, color: '#60a5fa' },
            { label: 'Completed', value: orders.filter(o => o.status === 'COMPLETED').length, color: '#22c55e' },
            { label: 'Processing', value: orders.filter(o => o.status !== 'COMPLETED').length, color: '#f59e0b' },
            { label: 'Total Revenue', value: `$${orders.reduce((sum, o) => sum + o.amount, 0).toFixed(2)}`, color: '#a78bfa' },
          ].map((stat, i) => (
            <div key={i} style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
              <p style={{ margin: '0 0 8px', color: '#94a3b8', fontSize: '13px' }}>{stat.label}</p>
              <p style={{ margin: 0, fontSize: '28px', fontWeight: 'bold', color: stat.color }}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px' }}>

                    {/* Place Order Form */}
                    <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
                      <h2 style={{ marginTop: 0, color: '#60a5fa' }}>Place New Order</h2>
                      <input 
                        type="text" 
                        placeholder="Customer ID" 
                        value={customerId} 
                        onChange={(e) => setCustomerId(e.target.value)}
                        style={{ width: '100%', padding: '10px', marginBottom: '12px', background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: '6px' }}
                      />
                      <input 
                        type="number" 
                        placeholder="Amount" 
                        value={amount} 
                        onChange={(e) => setAmount(e.target.value)}
                        style={{ width: '100%', padding: '10px', marginBottom: '12px', background: '#0f172a', color: '#f1f5f9', border: '1px solid #334155', borderRadius: '6px' }}
                      />
                      <button 
                        onClick={placeOrder} 
                        disabled={placing}
                        style={{ width: '100%', padding: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        {placing ? 'Placing...' : 'Place Order'}
                      </button>
                      {message && <p style={{ color: '#22c55e', marginTop: '12px' }}>{message}</p>}
                      {error && <p style={{ color: '#ef4444', marginTop: '12px' }}>{error}</p>}
                    </div>
          
                    {/* Orders Table */}
                    <div style={{ background: '#1e293b', borderRadius: '12px', padding: '20px', border: '1px solid #334155' }}>
                      <h2 style={{ marginTop: 0, color: '#60a5fa' }}>Recent Orders</h2>
                      {loading ? (
                        <p style={{ color: '#94a3b8' }}>Loading...</p>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #334155' }}>
                                <th style={{ textAlign: 'left', padding: '12px', color: '#94a3b8' }}>Order ID</th>
                                <th style={{ textAlign: 'left', padding: '12px', color: '#94a3b8' }}>Customer</th>
                                <th style={{ textAlign: 'left', padding: '12px', color: '#94a3b8' }}>Amount</th>
                                <th style={{ textAlign: 'left', padding: '12px', color: '#94a3b8' }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orders.map((order) => (
                                <tr key={order._id} style={{ borderBottom: '1px solid #334155' }}>
                                  <td style={{ padding: '12px', color: '#60a5fa' }}>{order.orderId}</td>
                                  <td style={{ padding: '12px', color: '#f1f5f9' }}>{order.customerId}</td>
                                  <td style={{ padding: '12px', color: '#f1f5f9' }}>${order.amount.toFixed(2)}</td>
                                  <td style={{ padding: '12px' }}>
                                    <span style={{ background: getStatusColor(order.status), color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                                      {order.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          
          export default App;