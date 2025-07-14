// api/get-deposit-details.js

const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios'); // Pastikan axios diimpor

// --- Konfigurasi MongoDB (TETAP SAMA) ---
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'amat_hosting_db';

if (!MONGODB_URI) {
    console.error("MongoDB URI is not set for get-deposit-details handler.");
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
        return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    const orderId = req.query.order_id;
    const depositId = req.query.deposit_id;

    if (!orderId || !depositId) {
        return res.status(400).json({ success: false, message: 'Order ID and Deposit ID are required.' });
    }

    const db = await connectToDatabase();
    const ordersCollection = db.collection('orders');

    try {
        const order = await ordersCollection.findOne({ orderId: orderId, depositId: depositId });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order or deposit not found.' });
        }

        if (order.depositDetails) {
            let qr_image_base64 = null;
            let qr_image_format = 'image/png'; // Asumsi default PNG, bisa disesuaikan jika ForestAPI memberi info Content-Type
            
            if (order.depositDetails.qr_image_url) {
                try {
                    // Ambil gambar QR dari URL ForestAPI
                    const imageResponse = await axios.get(order.depositDetails.qr_image_url, {
                        responseType: 'arraybuffer' // Penting: Ambil sebagai binary data
                    });

                    // Dapatkan Content-Type dari header respons gambar jika tersedia
                    if (imageResponse.headers['content-type']) {
                        qr_image_format = imageResponse.headers['content-type'];
                    }

                    // Konversi binary data ke Base64
                    qr_image_base64 = Buffer.from(imageResponse.data).toString('base64');
                    console.log(`QR image fetched and converted to Base64 for deposit ID: ${depositId}`);

                } catch (imageError) {
                    console.error(`Failed to fetch QR image from URL: ${order.depositDetails.qr_image_url}`, imageError.message);
                    // Jika gambar gagal diambil, kita tetap kirim data lainnya
                    qr_image_base64 = null; // Pastikan null jika gagal
                }
            }

            res.status(200).json({
                success: true,
                message: 'Deposit details fetched.',
                depositDetails: {
                    id: order.depositDetails.id,
                    reff_id: order.depositDetails.reff_id,
                    nominal: order.depositDetails.nominal,
                    method: order.depositDetails.method,
                    //qr_code_url: order.depositDetails.qr_image_url, // Tidak lagi diperlukan di frontend
                    qr_image_base64: qr_image_base64, // Data gambar Base64
                    qr_image_format: qr_image_format, // Format gambar
                    status: order.depositDetails.status,
                    created_at: order.depositDetails.created_at,
                    expired_at: order.depositDetails.expired_at
                },
                orderStatus: order.status
            });
        } else {
            res.status(404).json({ success: false, message: 'Deposit details not available for this order.' });
        }

    } catch (error) {
        console.error('Error fetching deposit details:', error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
};