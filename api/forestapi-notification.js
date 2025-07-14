// api/forestapi-notification.js

const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');

// --- Konfigurasi Umum & Lingkungan ---
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'amat_hosting_db';

if (!MONGODB_URI) {
    console.error("MongoDB URI is not set for notification handler.");
}

// --- Konfigurasi ForestAPI ---
const FOREST_API_BASE_URL = 'https://m.forestapi.web.id/api/h2h';
const FOREST_API_KEY = process.env.FOREST_API_KEY; 
const FOREST_API_WEBHOOK_SECRET = process.env.FOREST_API_WEBHOOK_SECRET; 

if (!FOREST_API_KEY) {
    console.error("FOREST_API_KEY is not set. ForestAPI calls might fail.");
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
    const client = await MongoClient.connect(MONGODB_URI);
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

// URL API eksternal Pterodactyl (dari Mat)
const EXTERNAL_PTERO_API_BASE_URL = 'https://restapi.mat.web.id/api/pterodactyl/create';
const ALL_API_PARAMS_ORDERED = ['username', 'ram', 'disk', 'cpu', 'eggid', 'nestid', 'loc', 'domain', 'ptla', 'ptlc'];


module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const notification = req.body;
    const { deposit_id, reff_id, status: deposit_status, nominal, message } = notification; 

    console.log(`ForestAPI Notification Received: Deposit ID: ${deposit_id}, Reff ID: ${reff_id}, Status: ${deposit_status}`);

    const db = await connectToDatabase();
    const ordersCollection = db.collection('orders');

    try {
        // 1. Verifikasi Notifikasi (Jika ForestAPI memiliki mekanisme signature/secret)
        // If FOREST_API_WEBHOOK_SECRET exists, implement verification here
        // E.g., const signature = req.headers['x-forestapi-signature']; // Check docs
        // if (!verifyWebhookSignature(req.rawBody, signature, FOREST_API_WEBHOOK_SECRET)) { return res.status(403).send('Unauthorized'); }


        // 2. Ambil data order dari database menggunakan deposit_id
        const order = await ordersCollection.findOne({ depositId: deposit_id });

        if (!order) {
            console.warn(`Order with Deposit ID ${deposit_id} not found in database.`);
            return res.status(404).json({ message: 'Order not found for this deposit.' });
        }

        // Cek apakah order sudah diproses sebelumnya
        if (order.status === 'active' || order.status === 'paid') {
            console.log(`Order ${order.orderId} already processed or active. Skipping.`);
            return res.status(200).send('OK');
        }

        // 3. Proses Status Deposit dari ForestAPI
        if (deposit_status === 'SUCCESS') { 
            await ordersCollection.updateOne(
                { _id: order._id },
                { $set: { status: 'paid', depositStatus: deposit_status, updatedAt: new Date() } }
            );
            console.log(`Order ${order.orderId} status updated to paid via ForestAPI webhook.`);

            // --- Otomatisasi Pembuatan Server Via API Eksternal Pterodactyl (Mat) ---
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
                console.log('External Pterodactyl API Response:', apiResponseData);

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
                    console.log(`Order ${order.orderId} status updated to active with server info from external API.`);
                    console.log(`Email konfirmasi dan detail akses terkirim ke pelanggan (username: ${order.username}).`);

                } else {
                    console.error('External Pterodactyl API reported failure:', apiResponseData.message || 'Unknown error from Mat API');
                    await ordersCollection.updateOne(
                        { _id: order._id },
                        { $set: { status: 'failed_server_creation_external_api', error: apiResponseData.message || 'External API failed', updatedAt: new Date() } }
                    );
                }

            } catch (serverError) {
                console.error('Error calling external Pterodactyl API:', serverError.response ? serverError.response.data : serverError.message);
                await ordersCollection.updateOne(
                    { _id: order._id },
                    { $set: { status: 'failed_server_creation_api_call_error', error: serverError.message, updatedAt: new Date() } }
                );
            }
        } else if (deposit_status === 'PENDING') { 
            await ordersCollection.updateOne(
                { _id: order._id },
                { $set: { status: 'waiting_payment', depositStatus: deposit_status, updatedAt: new Date() } }
            );
            console.log(`Order ${order.orderId} status updated to waiting_payment via ForestAPI webhook.`);
        } else if (deposit_status === 'EXPIRED' || deposit_status === 'FAILED' || deposit_status === 'CANCELLED') {
            await ordersCollection.updateOne(
                { _id: order._id },
                { $set: { status: 'failed', depositStatus: deposit_status, updatedAt: new Date() } }
            );
            console.log(`Order ${order.orderId} status updated to failed via ForestAPI webhook.`);
        }

        res.status(200).send('OK'); // Penting: Balas OK agar ForestAPI tidak retry

    } catch (error) {
        console.error('Error processing ForestAPI notification:', error.message);
        res.status(500).send('Error processing notification.');
    }
};