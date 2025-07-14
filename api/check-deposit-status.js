// api/check-deposit-status.js

const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');

// --- Konfigurasi MongoDB ---
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'amat_hosting_db';

if (!MONGODB_URI) {
    console.error("MongoDB URI is not set for check-deposit-status handler.");
}

// --- Konfigurasi ForestAPI ---
const FOREST_API_BASE_URL = 'https://m.forestapi.web.id/api/h2h';
const FOREST_API_KEY = process.env.FOREST_API_KEY;

if (!FOREST_API_KEY) {
    console.error("FOREST_API_KEY is not set. ForestAPI status checks might fail.");
}

let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }
    const client = await MongoClient.connect(MONGODB_URI);
    const db = client.db(DB_NAME);
    cachedDb = db;
    return db;
}

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const depositId = req.query.deposit_id;

    if (!depositId) {
        return res.status(400).json({ success: false, message: 'Deposit ID is required.' });
    }

    const db = await connectToDatabase();
    const ordersCollection = db.collection('orders');

    try {
        // Panggil endpoint Cek Status ForestAPI
        const forestApiResponse = await axios.post(`${FOREST_API_BASE_URL}/deposit/status`, {
            id: depositId,
            api_key: FOREST_API_KEY
        });
        const forestApiData = forestApiResponse.data;

        if (forestApiData.success && forestApiData.data) {
            const depositStatus = forestApiData.data.status;
            // Update status deposit di DB kita
            await ordersCollection.updateOne(
                { depositId: depositId },
                { $set: { depositStatus: depositStatus, updatedAt: new Date() } }
            );

            res.status(200).json({
                success: true,
                message: 'Deposit status fetched.',
                depositStatus: depositStatus,
                nominal: forestApiData.data.nominal,
                method: forestApiData.data.method,
            });
        } else {
            res.status(500).json({ success: false, message: forestApiData.message || 'Gagal mengecek status deposit dari ForestAPI.' });
        }

    } catch (error) {
        console.error('Error checking deposit status:', error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, message: 'Internal server error while checking deposit status.' });
    }
};