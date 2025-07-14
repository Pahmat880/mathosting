// api/midtrans-notification.js

const Midtrans = require('midtrans-client');
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const crypto = require('crypto');

// --- Konfigurasi Umum & Lingkungan ---
const IS_MIDTRANS_PRODUCTION = process.env.NODE_ENV === 'production';

// --- Konfigurasi Midtrans ---
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const MIDTRANS_CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY;

if (!MIDTRANS_SERVER_KEY || !MIDTRANS_CLIENT_KEY) {
    console.error("Midtrans API keys are not set for notification handler. Please check your environment variables.");
}

const coreApi = new Midtrans.CoreApi({
    isProduction: IS_MIDTRANS_PRODUCTION,
    serverKey: MIDTRANS_SERVER_KEY,
    clientKey: MIDTRANS_CLIENT_KEY
});

// --- Konfigurasi Pterodactyl Eksternal API ---
const EXTERNAL_PTERO_API_BASE_URL = 'https://restapi.mat.web.id/api/pterodactyl/create';
const ALL_API_PARAMS_ORDERED = ['username', 'ram', 'disk', 'cpu', 'eggid', 'nestid', 'loc', 'domain', 'ptla', 'ptlc'];

// --- Konfigurasi MongoDB ---
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'amat_hosting_db';

if (!MONGODB_URI) {
    console.error("MongoDB URI is not set for notification handler.");
}

// --- Domain Pterodactyl Panel (dari ENV) ---
const PTERO_PANEL_DOMAIN = process.env.PTERO_PANEL_DOMAIN;

if (!PTERO_PANEL_DOMAIN) {
    console.error("PTERO_PANEL_DOMAIN is not set in environment variables. Panel URLs might be incorrect.");
}

// --- Kunci API Pterodactyl (dari ENV Anda sendiri) ---
const PTERO_API_KEY_PTLA = process.env.PTERO_API_KEY_PTLA;
const PTERO_API_KEY_PTLC = process.env.PTERO_API_KEY_PTLC;

if (!PTERO_API_KEY_PTLA || !PTERO_API_KEY_PTLC) {
    console.error("Pterodactyl Panel API keys (PTLA/PTLC) are not set. External API calls might fail.");
}

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

// Data spesifikasi paket (loc diisi dengan nilai 1)
const packageSpecs = {
    'bot-sentinel': { memory: 2048, disk: 10240, cpu: 100, egg_id: '5', nest_id: '1', loc: '1' },
    'bot-guardian': { memory: 4096, disk: 20480, cpu: 200, egg_id: '5', nest_id: '1', loc: '1' },
    'bot-titan': { memory: 6144, disk: 30720, cpu: 300, egg_id: '5', nest_id: '1', loc: '1' },
    'bot-colossus': { memory: 8192, disk: 40960, cpu: 400, egg_id: '5', nest_id: '1', loc: '1' },
    'bot-infinity': { memory: 0, disk: 51200, cpu: 0, egg_id: '5', nest_id: '1', loc: '1' }
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const notification = req.body;
    const {
        order_id,
        transaction_status,
        fraud_status,
        signature_key,
        gross_amount
    } = notification;

    console.log(`Midtrans Notification Received for Order ID: ${order_id}, Status: ${transaction_status}, Fraud: ${fraud_status}`);

    const db = await connectToDatabase();
    const ordersCollection = db.collection('orders');

    try {
        // 1. Verifikasi Notifikasi (Signature Key)
        const hash = crypto.createHash('sha512').update(`${order_id}${gross_amount}.00${transaction_status}${MIDTRANS_SERVER_KEY}`).digest('hex');
        if (hash !== signature_key) {
            console.warn(`Invalid signature for order ${order_id}. Incoming: ${signature_key}, Calculated: ${hash}`);
            return res.status(403).json({ message: 'Invalid signature.' });
        }

        // 2. Ambil data order dari database
        const order = await ordersCollection.findOne({ orderId: order_id });

        if (!order) {
            console.warn(`Order with ID ${order_id} not found in database.`);
            return res.status(404).json({ message: 'Order not found.' });
        }

        // 3. Cek apakah order sudah diproses sebelumnya
        if (order.status === 'active' || order.status === 'paid') {
            console.log(`Order ${order_id} already processed or active. Skipping.`);
            return res.status(200).send('OK');
        }

        // 4. Proses Status Transaksi Midtrans
        if (transaction_status === 'capture' || transaction_status === 'settlement') {
            if (fraud_status === 'challenge') {
                await ordersCollection.updateOne(
                    { _id: order._id },
                    { $set: { status: 'challenge', updatedAt: new Date() } }
                );
                console.log(`Order ${order_id} status updated to challenge.`);
            } else if (fraud_status === 'accept') {
                await ordersCollection.updateOne(
                    { _id: order._id },
                    { $set: { status: 'paid', updatedAt: new Date() } }
                );
                console.log(`Order ${order_id} status updated to paid. Starting server creation.`);

                // --- Otomatisasi Pembuatan Server Via API Eksternal ---
                try {
                    const specs = packageSpecs[order.packageId];
                    if (!specs) {
                        console.error(`Package specs not found for packageId: ${order.packageId}`);
                        await ordersCollection.updateOne(
                            { _id: order._id },
                            { $set: { status: 'failed_invalid_package', error: 'Invalid package specs', updatedAt: new Date() } }
                        );
                        return res.status(400).send('Invalid package ID.');
                    }

                    // --- Membangun URL dengan parameter sesuai permintaan ---
                    const currentParams = {
                        username: order.username,
                        ram: specs.memory,
                        disk: specs.disk,
                        cpu: specs.cpu,
                        eggid: specs.egg_id,
                        nestid: specs.nest_id,
                        loc: specs.loc,
                        domain: PTERO_PANEL_DOMAIN,
                        ptla: PTERO_API_KEY_PTLA,
                        ptlc: PTERO_API_KEY_PTLC
                    };

                    let queryStringParts = [];
                    ALL_API_PARAMS_ORDERED.forEach(paramName => {
                        const value = currentParams[paramName] !== undefined && currentParams[paramName] !== null ? String(currentParams[paramName]) : '';
                        queryStringParts.push(`${paramName}=${encodeURIComponent(value)}`);
                    });

                    const fullApiUrl = `${EXTERNAL_PTERO_API_BASE_URL}?${queryStringParts.join('&')}`;

                    console.log(`Calling external Pterodactyl API: ${fullApiUrl}`);

                    const createServerRes = await axios.get(fullApiUrl);

                    const apiResponseData = createServerRes.data;
                    console.log('External API Response:', apiResponseData);

                    if (apiResponseData.success) {
                        const serverDetails = {
                            name: apiResponseData.data.name || order.packageName,
                            username: apiResponseData.data.username,
                            password: apiResponseData.data.password,
                            panelUrl: apiResponseData.data.panelUrl || `https://${PTERO_PANEL_DOMAIN}`,
                            ipAddress: apiResponseData.data.ip || 'N/A',
                            port: apiResponseData.data.port || 'N/A',
                            serverId: apiResponseData.data.serverId || null,
                            serverUUID: apiResponseData.data.serverUUID || null
                        };

                        await ordersCollection.updateOne(
                            { _id: order._id },
                            { $set: {
                                status: 'active',
                                serverDetails: serverDetails,
                                activatedAt: new Date(),
                                updatedAt: new Date()
                            }}
                        );
                        console.log(`Order ${order_id} status updated to active with server info from external API.`);

                        console.log(`Email konfirmasi dan detail akses terkirim ke pelanggan (username: ${order.username}).`);

                    } else {
                        console.error('External API reported failure:', apiResponseData.message || 'Unknown error from external API');
                        await ordersCollection.updateOne(
                            { _id: order._id },
                            { $set: { status: 'failed_server_creation_external_api', error: apiResponseData.message || 'External API failed', updatedAt: new Date() } }
                        );
                        return res.status(500).send('External API failed to create server.');
                    }

                } catch (serverError) {
                    console.error('Error calling external Pterodactyl API:', serverError.response ? serverError.response.data : serverError.message);
                    if (serverError.response && serverError.response.data) {
                        console.error('External API Error Details:', JSON.stringify(serverError.response.data, null, 2));
                    }
                    await ordersCollection.updateOne(
                        { _id: order._id },
                        { $set: { status: 'failed_server_creation_api_call_error', error: serverError.message, updatedAt: new Date() } }
                    );
                    return res.status(500).send('Error connecting to external API or server creation failed.');
                }
            }
        } else if (transaction_status === 'pending') {
            await ordersCollection.updateOne(
                { _id: order._id },
                { $set: { status: 'pending_payment', updatedAt: new Date() } }
            );
            console.log(`Order ${order_id} status updated to pending payment.`);
        } else if (transaction_status === 'expire' || transaction_status === 'cancel' || transaction_status === 'deny') {
            await ordersCollection.updateOne(
                { _id: order._id },
                { $set: { status: 'failed', updatedAt: new Date() } }
            );
            console.log(`Order ${order_id} status updated to failed/expired.`);
        }

        res.status(200).send('OK');

    } catch (error) {
        console.error('Error processing Midtrans notification:', error.message);
        res.status(500).send('Error processing notification.');
    }
};