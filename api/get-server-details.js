// api/get-server-details.js

const { MongoClient, ObjectId } = require('mongodb');

// --- Konfigurasi MongoDB ---
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'amat_hosting_db';

if (!MONGODB_URI) {
    console.error("MongoDB URI is not set for get-server-details handler.");
}

// Cache koneksi MongoDB
let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }
    const client = await MongoClient.connect(MONGODB_URI); // Perbaikan: Menghapus opsi deprecated
    const db = client.db(DB_NAME);
    cachedDb = db;
    return db;
}

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const orderId = req.query.order_id;

    if (!orderId) {
        return res.status(400).json({ message: 'Order ID is required.' });
    }

    const db = await connectToDatabase();
    const ordersCollection = db.collection('orders');

    try {
        const order = await ordersCollection.findOne({ orderId: orderId });

        if (!order) {
            return res.status(404).json({ message: 'Order not found.' });
        }

        if (order.status === 'active' && order.serverDetails) {
            res.status(200).json({
                orderStatus: order.status,
                server: {
                    name: order.serverDetails.name || order.packageName,
                    username: order.serverDetails.username,
                    password: order.serverDetails.password,
                    panelUrl: order.serverDetails.panelUrl,
                    ipAddress: order.serverDetails.ipAddress,
                    port: order.serverDetails.port
                }
            });
        } else if (order.status === 'pending_payment' || order.status === 'paid' || order.status === 'challenge') {
            res.status(200).json({
                orderStatus: order.status,
                message: 'Server creation is pending or in progress. Please wait.'
            });
        }
        else {
            res.status(404).json({ message: 'Server details not available yet or order not active.', orderStatus: order.status });
        }

    } catch (error) {
        console.error('Error fetching server details:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
};