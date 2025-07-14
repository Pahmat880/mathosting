// api/validate-promocode.js

const { MongoClient } = require('mongodb');

// --- Konfigurasi MongoDB ---
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'amat_hosting_db';

if (!MONGODB_URI) {
    console.error("MongoDB URI is not set for validate-promocode handler.");
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

// Data spesifikasi paket (loc diisi dengan nilai 1, harga per bulan)
// Ini adalah copy dari packageSpecs di create-deposit.js.
// Idealnya, data ini juga diambil dari DB agar tidak duplikasi.
const packageSpecs = {
    'bot-sentinel': { price: 500 },
    'bot-guardian': { price: 60000 },
    'bot-titan': { price: 80000 },
    'bot-colossus': { price: 100000 },
    'bot-infinity': { price: 150000 }
};


module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { promoCode, packageId } = req.body;

    if (!promoCode || !packageId) {
        return res.status(400).json({ success: false, message: 'Kode promo dan ID paket harus disediakan.' });
    }

    const db = await connectToDatabase();
    const promoCollection = db.collection('promocodes');
    const now = new Date();

    try {
        const promo = await promoCollection.findOne({
            code: promoCode,
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now }
        });

        if (!promo) {
            return res.status(404).json({ success: false, message: 'Kode promo tidak ditemukan, tidak aktif, atau kadaluarsa.' });
        }

        if (promo.usageLimit && promo.currentUsage >= promo.usageLimit) {
            return res.status(400).json({ success: false, message: 'Kode promo sudah mencapai batas penggunaan.' });
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

        return res.status(200).json({
            success: true,
            message: 'Kode promo berhasil diterapkan.',
            discountType: promo.discountType,
            discountValue: discountValue,
            code: promo.code
        });

    } catch (error) {
        console.error('Error validating promo code:', error);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan internal saat memvalidasi kode promo.' });
    }
};
