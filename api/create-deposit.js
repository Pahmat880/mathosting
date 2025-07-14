// api/create-deposit.js

const { MongoClient } = require('mongodb');
const axios = require('axios');
const crypto = require('crypto');

// --- Konfigurasi Umum & Lingkungan (TETAP SAMA) ---
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'amat_hosting_db';

if (!MONGODB_URI) {
    console.error("MongoDB URI is not set. Please check your environment variables.");
}

// --- Konfigurasi ForestAPI (TETAP SAMA) ---
const FOREST_API_BASE_URL = 'https://m.forestapi.web.id/api/h2h';
const FOREST_API_KEY = process.env.FOREST_API_KEY;

if (!FOREST_API_KEY) {
    console.error("FOREST_API_KEY is not set. API calls to ForestAPI might fail.");
}

// Cache koneksi MongoDB untuk Serverless Functions (TETAP SAMA)
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

// Data spesifikasi paket (TETAP SAMA)
const packageSpecs = {
    'bot-sentinel': { memory: 2048, cpu: 100, disk: 10240, allocations: 1, databases: 0, egg_id: '5', nest_id: '1', loc: '1', startup: 'node index.js', price: 500 },
    'bot-guardian': { memory: 4096, cpu: 200, disk: 20480, allocations: 1, databases: 0, egg_id: '5', nest_id: '1', loc: '1', startup: 'node index.js', price: 60000 },
    'bot-titan': { memory: 6144, cpu: 300, disk: 30720, allocations: 1, databases: 0, egg_id: '5', nest_id: '1', loc: '1', startup: 'node index.js', price: 80000 },
    'bot-colossus': { memory: 8192, cpu: 400, disk: 40960, allocations: 1, databases: 0, egg_id: '5', nest_id: '1', loc: '1', startup: 'node index.js', price: 100000 },
    'bot-infinity': { memory: 0, cpu: 0, disk: 51200, allocations: 1, databases: 0, egg_id: '5', nest_id: '1', loc: '1', startup: 'node index.js', price: 150000 }
};

// Fungsi validasi promo code di backend (TETAP SAMA)
async function validatePromoCodeBackend(promoCode, packageId, db) {
    const promoCollection = db.collection('promocodes');
    const now = new Date();

    const promo = await promoCollection.findOne({
        code: promoCode,
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now }
    });

    if (!promo) {
        return { success: false, message: 'Kode promo tidak ditemukan, tidak aktif, atau kadaluarsa.' };
    }

    if (promo.usageLimit && promo.currentUsage >= promo.usageLimit) {
        return { success: false, message: 'Kode promo sudah mencapai batas penggunaan.' };
    }

    let discountValue = 0;
    const basePrice = packageSpecs[packageId].price;

    if (promo.discountType === 'percentage') {
        discountValue = basePrice * (promo.discountValue / 100);
    } else if (promo.discountType === 'fixed') {
        discountValue = promo.discountValue;
    }

    if (discountValue > basePrice) {
        discountValue = basePrice;
    }

    return { success: true, discountValue: discountValue, promoId: promo._id };
}


// Ini adalah handler untuk Serverless Function
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { username, phoneNumber, packageId, packageName, totalPrice, taxPercentage, appliedDiscountAmount, appliedPromoCode } = req.body;

    if (!username || !packageId || !totalPrice || !taxPercentage) {
        return res.status(400).json({ message: 'Semua kolom wajib diisi (Username, Paket, Total Pembayaran, Persentase Pajak).' });
    }

    const db = await connectToDatabase();
    const ordersCollection = db.collection('orders');
    const customersCollection = db.collection('customers');
    const promoCollection = db.collection('promocodes');


    try {
        let customer = await customersCollection.findOne({ username: username });
        if (!customer) {
            customer = {
                username: username,
                phoneNumber: phoneNumber || null,
                createdAt: new Date(),
            };
            const result = await customersCollection.insertOne(customer);
            customer._id = result.insertedId;
            console.log(`New customer created in DB: ${username}`);
        } else {
            if (phoneNumber && customer.phoneNumber !== phoneNumber) {
                await customersCollection.updateOne(
                    { _id: customer._id },
                    { $set: { phoneNumber: phoneNumber, updatedAt: new Date() } }
                );
            }
            console.log(`Existing customer found in DB: ${username}`);
        }

        const selectedPackage = packageSpecs[packageId];
        if (!selectedPackage) {
            return res.status(400).json({ message: 'Paket tidak valid.' });
        }

        let calculatedDiscountAmount = 0;
        let finalPromoCode = null;

        if (appliedPromoCode) {
            const promoValidationResult = await validatePromoCodeBackend(appliedPromoCode, packageId, db);
            if (promoValidationResult.success) {
                calculatedDiscountAmount = promoValidationResult.discountValue;
                finalPromoCode = appliedPromoCode;
            } else {
                console.warn(`Promo code '${appliedPromoCode}' invalid on backend: ${promoValidationResult.message}`);
            }
        }

        const basePrice = selectedPackage.price; 
        let priceAfterDiscount = basePrice - calculatedDiscountAmount;
        if (priceAfterDiscount < 0) priceAfterDiscount = 0;

        const calculatedTaxAmount = priceAfterDiscount * (taxPercentage / 100);
        const finalCalculatedPrice = priceAfterDiscount + calculatedTaxAmount;

        if (Math.abs(finalCalculatedPrice - totalPrice) > 1) {
            console.warn(`Harga tidak cocok. Dari Frontend: ${totalPrice}, Hitung Backend: ${finalCalculatedPrice}. Diskon Promo: ${calculatedDiscountAmount}`);
            return res.status(400).json({ message: 'Harga tidak valid atau manipulasi terdeteksi. Silakan coba lagi.' });
        }

        const orderId = `AMAT-${Date.now()}`;
        const reffId = `REF-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        const depositPayload = {
            nominal: finalCalculatedPrice,
            method: 'QRISFAST',
            reff_id: reffId,
            api_key: FOREST_API_KEY,
            fee_by_customer: true 
        };

        console.log('Sending deposit request to ForestAPI:', depositPayload);
        const forestApiResponse = await axios.post(`${FOREST_API_BASE_URL}/deposit/create`, depositPayload);
        const forestApiData = forestApiResponse.data;
        console.log('ForestAPI Deposit Response:', forestApiData);

        // --- Perbaikan di sini: Cek forestApiData.status === 'success' ---
        if (forestApiData.status === 'success' && forestApiData.data) { 
            if (finalPromoCode) {
                await promoCollection.updateOne(
                    { code: finalPromoCode },
                    { $inc: { currentUsage: 1 } } 
                );
                console.log(`Promo code '${finalPromoCode}' usage incremented.`);
            }

            const orderData = {
                orderId: orderId,
                customerId: customer._id,
                username: username,
                phoneNumber: phoneNumber || null,
                packageId: packageId,
                packageName: packageName,
                pricePerMonth: selectedPackage.price,
                duration: 1, 
                originalBasePrice: basePrice,
                appliedPromoCode: finalPromoCode,
                appliedDiscountAmount: calculatedDiscountAmount,
                taxPercentage: taxPercentage,
                totalPrice: finalCalculatedPrice,
                paymentMethod: 'QRISFAST',
                status: 'waiting_payment', // Status awal di DB kita
                reffId: reffId,
                depositId: forestApiData.data.id,
                depositDetails: { // Simpan detail dari respons ForestAPI
                    id: forestApiData.data.id,
                    reff_id: forestApiData.data.reff_id,
                    nominal: forestApiData.data.nominal,
                    method: forestApiData.data.method,
                    qr_image_url: forestApiData.data.qr_image_url,
                    qr_image_string: forestApiData.data.qr_image_string,
                    status: forestApiData.data.status, // Status dari ForestAPI (e.g., 'pending')
                    created_at: forestApiData.data.created_at,
                    expired_at: forestApiData.data.expired_at,
                    fee: forestApiData.data.fee,
                    get_balance: forestApiData.data.get_balance
                },
                createdAt: new Date(),
                updatedAt: new Date(),
                serverDetails: null
            };
            await ordersCollection.insertOne(orderData);
            console.log(`Order ${orderId} saved to MongoDB. Status: waiting_payment. Deposit ID: ${forestApiData.data.id}`);

            res.status(200).json({
                success: true, // Ubah respons ini menjadi true
                message: forestApiData.message || 'Deposit berhasil dibuat, silakan lanjutkan pembayaran.', // Ambil pesan dari ForestAPI
                orderId: orderId,
                depositId: forestApiData.data.id,
                qr_image_url: forestApiData.data.qr_image_url,
                nominal: forestApiData.data.nominal,
                deposit_status: forestApiData.data.status, // Status dari ForestAPI
                created_at: forestApiData.data.created_at,
                expired_at: forestApiData.data.expired_at
            });

        } else {
            console.error('ForestAPI reported deposit creation failure:', forestApiData.message || 'Unknown error from ForestAPI');
            // Jika status bukan 'success' atau data tidak ada, anggap gagal
            res.status(500).json({ success: false, message: forestApiData.message || 'Gagal membuat deposit pembayaran.' });
        }

    } catch (error) {
        console.error('Error in create-deposit API:', error.response ? error.response.data : error.message);
        // Tangkap error dari axios (misalnya network error, atau status HTTP non-2xx)
        let errorMessage = 'Terjadi kesalahan koneksi atau internal saat membuat deposit.';
        if (error.response && error.response.data && error.response.data.message) {
             errorMessage = error.response.data.message;
        } else if (error.message) {
            errorMessage = error.message;
        }
        res.status(500).json({ success: false, message: errorMessage });
    }
};
