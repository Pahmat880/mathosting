// public/script.js

document.addEventListener('DOMContentLoaded', () => {
    // --- Custom Pop-up Functionality ---
    const customPopup = document.getElementById('customPopup');
    const popupIcon = document.getElementById('popupIcon');
    const popupTitle = document.getElementById('popupTitle');
    const popupMessage = document.getElementById('popupMessage');
    const popupCloseBtn = document.getElementById('popupCloseBtn');

    const showCustomPopup = (message, title = 'Notifikasi', iconClass = 'fas fa-info-circle', iconType = 'info', callback = null) => {
        popupIcon.className = `popup-icon ${iconClass} ${iconType}`;
        popupTitle.textContent = title;
        popupMessage.textContent = message;
        customPopup.classList.add('show');

        const closeHandler = () => {
            customPopup.classList.remove('show');
            popupCloseBtn.removeEventListener('click', closeHandler);
            customPopup.removeEventListener('click', overlayClickHandler); 

            if (callback) {
                callback();
            }
        };
        
        const overlayClickHandler = (e) => {
            if (e.target === customPopup) { 
                closeHandler();
            }
        };

        popupCloseBtn.addEventListener('click', closeHandler);
        customPopup.addEventListener('click', overlayClickHandler);
    };

    // --- Logic for index.html (TETAP SAMA) ---
    const categoryCards = document.querySelectorAll('.category-card');
    const botPackagesSection = document.getElementById('bot-packages');
    const minecraftPackagesSection = document.getElementById('minecraft-packages');
    const packageButtons = document.querySelectorAll('.packages-section .btn-primary');

    const showCategoryPackages = (category) => {
        if (category === 'bot') {
            botPackagesSection.classList.add('active');
            minecraftPackagesSection.classList.remove('active');
        } else if (category === 'minecraft') {
            botPackagesSection.classList.remove('active');
            minecraftPackagesSection.classList.add('active');
        }
    };

    categoryCards.forEach(card => {
        card.addEventListener('click', () => {
            const category = card.dataset.category;

            if (card.classList.contains('coming-soon')) {
                showCustomPopup(
                    'Layanan ini akan segera tersedia! Mohon bersabar ya.',
                    'Coming Soon!',
                    'fas fa-hourglass-half', 
                    'info'
                );
                return;
            }

            categoryCards.forEach(c => c.classList.remove('active-category'));
            card.classList.add('active-category');

            showCategoryPackages(category);
        });
    });

    if (packageButtons.length > 0) {
        packageButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                const packageId = event.target.dataset.packageId;
                const packageName = event.target.dataset.packageName;
                const packagePrice = event.target.dataset.packagePrice;

                localStorage.setItem('selectedPackage', JSON.stringify({
                    id: packageId,
                    name: packageName,
                    price: parseFloat(packagePrice)
                }));

                window.location.href = 'checkout.html';
            });
        });
    }

    // --- Logic for checkout.html (form handling and price calculation) ---
    const checkoutForm = document.getElementById('checkoutForm');
    const summaryPackageName = document.getElementById('summaryPackageName');
    const summaryDuration = document.getElementById('summaryDuration'); // Akan selalu "1 Bulan"
    const summaryBasePrice = document.getElementById('summaryBasePrice');
    const summaryDiscount = document.getElementById('summaryDiscount'); 
    const summaryTax = document.getElementById('summaryTax');
    const summaryTotalPrice = document.getElementById('summaryTotalPrice');
    
    // Promo Code elements
    const promoCodeInput = document.getElementById('promoCode');
    const applyPromoBtn = document.getElementById('applyPromoBtn');
    const promoStatusMessage = document.getElementById('promoStatusMessage');
    const appliedDiscountAmountHidden = document.getElementById('appliedDiscountAmount');
    const appliedPromoCodeHidden = document.getElementById('appliedPromoCode');
    const taxPercentageHidden = document.getElementById('taxPercentage');


    let currentTaxPercentage = 0; 
    let currentAppliedDiscount = 0;
    let activePromoCode = '';


    if (checkoutForm) {
        const selectedPackageData = JSON.parse(localStorage.getItem('selectedPackage'));

        if (!selectedPackageData) {
            showCustomPopup(
                'Tidak ada paket yang dipilih. Anda akan dialihkan kembali ke halaman utama.',
                'Perhatian!',
                'fas fa-exclamation-triangle', 
                'warning',
                () => { window.location.href = 'index.html'; }
            );
            return;
        }

        document.getElementById('packageId').value = selectedPackageData.id;
        document.getElementById('packageName').value = selectedPackageData.name;
        document.getElementById('packagePrice').value = selectedPackageData.price;

        summaryPackageName.textContent = selectedPackageData.name;
        summaryDuration.textContent = '1 Bulan'; // Selalu 1 bulan

        const updatePriceSummary = () => {
            const basePrice = selectedPackageData.price; // Harga paket untuk 1 bulan
            
            // Hitung harga setelah diskon promo (jika ada)
            let priceAfterPromo = basePrice - currentAppliedDiscount;
            if (priceAfterPromo < 0) priceAfterPromo = 0; // Pastikan harga tidak negatif

            // Generate random tax percentage (1-3%) only if not already set or promo applied
            // To keep tax consistent after promo application, only generate once at load
            if (currentTaxPercentage === 0) { 
                 currentTaxPercentage = Math.floor(Math.random() * 3) + 1; // Random number between 1 and 3
            }
            taxPercentageHidden.value = currentTaxPercentage; // Update hidden input

            const taxAmount = priceAfterPromo * (currentTaxPercentage / 100);
            
            const finalTotalPrice = priceAfterPromo + taxAmount;

            summaryBasePrice.textContent = `Rp ${basePrice.toLocaleString('id-ID')}`;
            summaryDiscount.textContent = `Rp ${currentAppliedDiscount.toLocaleString('id-ID')}`;
            summaryTax.textContent = `Rp ${taxAmount.toLocaleString('id-ID')} (${currentTaxPercentage}%)`;
            summaryTotalPrice.textContent = `Rp ${finalTotalPrice.toLocaleString('id-ID')}`;
        };

        updatePriceSummary(); // Panggil pertama kali

        // Logic untuk Kode Promo
        applyPromoBtn.addEventListener('click', async () => {
            const promoCode = promoCodeInput.value.trim();
            if (!promoCode) {
                promoStatusMessage.textContent = 'Kode promo tidak boleh kosong.';
                promoStatusMessage.className = 'promo-status error';
                return;
            }

            try {
                const response = await fetch('/api/validate-promocode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ promoCode: promoCode, packageId: selectedPackageData.id })
                });
                const result = await response.json();

                if (response.ok && result.success) {
                    currentAppliedDiscount = result.discountValue;
                    activePromoCode = promoCode;
                    appliedDiscountAmountHidden.value = result.discountValue;
                    appliedPromoCodeHidden.value = promoCode;

                    promoStatusMessage.textContent = `Kode promo berhasil diterapkan! Diskon: Rp ${result.discountValue.toLocaleString('id-ID')}`;
                    promoStatusMessage.className = 'promo-status success';
                    updatePriceSummary(); // Perbarui harga setelah diskon
                } else {
                    currentAppliedDiscount = 0;
                    activePromoCode = '';
                    appliedDiscountAmountHidden.value = 0;
                    appliedPromoCodeHidden.value = '';
                    promoStatusMessage.textContent = result.message || 'Kode promo tidak valid atau kadaluarsa.';
                    promoStatusMessage.className = 'promo-status error';
                    updatePriceSummary(); // Perbarui harga (menghilangkan diskon jika tidak valid)
                }
            } catch (error) {
                console.error('Error validating promo code:', error);
                promoStatusMessage.textContent = 'Terjadi kesalahan saat memvalidasi kode promo.';
                promoStatusMessage.className = 'promo-status error';
                currentAppliedDiscount = 0;
                activePromoCode = '';
                appliedDiscountAmountHidden.value = 0;
                appliedPromoCodeHidden.value = '';
                updatePriceSummary();
            }
        });


        checkoutForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData(checkoutForm);
            const data = Object.fromEntries(formData.entries());
            
            // Pastikan data yang dikirim adalah nilai numerik yang benar
            data.totalPrice = parseFloat(summaryTotalPrice.textContent.replace(/[^0-9,-]+/g, "").replace(",", "."));
            data.basePrice = parseFloat(summaryBasePrice.textContent.replace(/[^0-9,-]+/g, "").replace(",", ".")); // Harga paket asli (sebelum diskon promo, tapi setelah diskon durasi jika ada)
            data.appliedDiscountAmount = parseFloat(appliedDiscountAmountHidden.value); // Diskon yang diterapkan di frontend
            data.appliedPromoCode = appliedPromoCodeHidden.value; // Kirim promo code yang sudah divalidasi frontend
            data.taxPercentage = parseFloat(taxPercentageHidden.value); // Pajak yang dihitung di frontend

            try {
                const response = await fetch('/api/create-deposit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    window.location.href = `/success.html?order_id=${result.orderId}&deposit_id=${result.depositId}`;
                } else {
                    showCustomPopup(
                        'Terjadi kesalahan saat membuat deposit: ' + (result.message || 'Unknown error'),
                        'Deposit Gagal',
                        'fas fa-times-circle', 
                        'error'
                    );
                }
            } catch (error) {
                console.error('Error during checkout:', error);
                showCustomPopup(
                    'Terjadi kesalahan koneksi. Silakan coba lagi. Detail: ' + error.message,
                    'Koneksi Error',
                    'fas fa-plug', 
                    'error'
                );
            }
        });
    }

    // --- Logic for success.html (Payment Instructions & Server Details) ---
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('order_id');
    const depositId = urlParams.get('deposit_id');
    
    const paymentInstructionsDiv = document.getElementById('paymentInstructions');
    const qrisImage = document.getElementById('qrisImage');
    const qrisLoading = document.getElementById('qrisLoading');
    const qrisNominal = document.getElementById('qrisNominal');
    const qrisDepositId = document.getElementById('qrisDepositId');
    const countdownSpan = document.getElementById('countdown');
    const cancelDepositBtn = document.getElementById('cancelDepositBtn');
    const paymentErrorMessageDiv = document.getElementById('paymentErrorMessage');
    const errorOrderIdPaymentSpan = document.getElementById('errorOrderIdPayment');

    const serverStatusMessageDiv = document.getElementById('serverStatusMessage');
    const serverDetailsDiv = document.getElementById('serverDetails');
    
    let countdownInterval;

    if (window.location.pathname.includes('success.html') && orderId && depositId) {
        paymentInstructionsDiv.style.display = 'block';
        qrisImage.style.display = 'none';
        qrisLoading.style.display = 'block';
        serverStatusMessageDiv.style.display = 'none';
        serverDetailsDiv.style.display = 'none';
        paymentErrorMessageDiv.style.display = 'none';
        errorOrderIdPaymentSpan.textContent = orderId;


        const fetchDepositDetails = async () => {
            try {
                const response = await fetch(`/api/get-deposit-details?order_id=${orderId}&deposit_id=${depositId}`);
                const result = await response.json();

                if (response.ok && result.success && result.depositDetails) {
                    const deposit = result.depositDetails;
                    qrisNominal.textContent = `Rp ${parseFloat(deposit.nominal).toLocaleString('id-ID')}`;
                    qrisDepositId.textContent = deposit.id;

                    if (deposit.qr_image_url) { 
                        qrisImage.src = deposit.qr_image_url;
                        qrisImage.style.display = 'block';
                        qrisLoading.style.display = 'none';
                    } else {
                        qrisLoading.textContent = 'QRIS tidak tersedia atau kadaluarsa.';
                        qrisLoading.style.color = '#dc3545';
                    }
                    
                    // Inisialisasi countdown dari expired_at ForestAPI
                    if (deposit.expired_at) {
                        const expiryTime = new Date(deposit.expired_at).getTime();

                        if (countdownInterval) clearInterval(countdownInterval);

                        countdownInterval = setInterval(() => {
                            const now = new Date().getTime();
                            const distance = expiryTime - now;

                            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

                            if (distance < 0) {
                                clearInterval(countdownInterval);
                                countdownSpan.textContent = "00:00";
                                showCustomPopup("Waktu pembayaran telah habis. Silakan buat pesanan baru.", "Deposit Kadaluarsa", "fas fa-clock", "error");
                                cancelDepositBtn.disabled = true; 
                                paymentInstructionsDiv.classList.add('hidden');
                                paymentErrorMessageDiv.style.display = 'block';
                                paymentErrorMessageDiv.querySelector('p').textContent = `Waktu pembayaran telah habis. Pesanan ID: ${orderId}`;
                                return;
                            }
                            countdownSpan.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                        }, 1000);
                    } else {
                        countdownSpan.textContent = "N/A";
                    }


                    cancelDepositBtn.addEventListener('click', async () => {
                        const confirmCancel = confirm("Anda yakin ingin membatalkan deposit ini?");
                        if (confirmCancel) {
                            try {
                                const cancelResponse = await fetch('/api/cancel-deposit', { 
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ depositId: deposit.id })
                                });
                                const cancelResult = await cancelResponse.json();
                                if (cancelResult.success) {
                                    showCustomPopup("Deposit berhasil dibatalkan. Anda bisa membuat pesanan baru.", "Deposit Dibatalkan", "fas fa-check-circle", "success", () => {
                                        window.location.href = '/'; 
                                    });
                                } else {
                                    showCustomPopup("Gagal membatalkan deposit: " + (cancelResult.message || "Unknown error"), "Pembatalan Gagal", "fas fa-times-circle", "error");
                                }
                            } catch (error) {
                                console.error('Error canceling deposit:', error);
                                showCustomPopup("Terjadi kesalahan saat membatalkan deposit.", "Pembatalan Error", "fas fa-plug", "error");
                            }
                        }
                    });

                    startPollingStatus(orderId, deposit.id);

                } else {
                    paymentInstructionsDiv.classList.add('hidden'); 
                    paymentErrorMessageDiv.style.display = 'block'; 
                    paymentErrorMessageDiv.querySelector('p').textContent = `Gagal memuat instruksi pembayaran. Error: ${result.message || 'Deposit not found or invalid.'} Order ID: ${orderId}`;
                    console.error('Error fetching deposit details:', result.message || 'Deposit data not found.');
                }
            } catch (error) {
                console.error('Error fetching deposit details:', error);
                paymentInstructionsDiv.classList.add('hidden');
                paymentErrorMessageDiv.style.display = 'block';
                paymentErrorMessageDiv.querySelector('p').textContent = 'Terjadi kesalahan koneksi saat memuat instruksi pembayaran. Silakan coba lagi. Order ID: ' + orderId;
            }
        };

        fetchDepositDetails(); 

        let serverPollingInterval;
        const startPollingStatus = (orderId, depositId) => {
            serverPollingInterval = setInterval(async () => {
                try {
                    const statusResponse = await fetch(`/api/check-deposit-status?deposit_id=${depositId}`); 
                    const statusResult = await statusResponse.json();

                    if (statusResponse.ok && statusResult.success && statusResult.depositStatus === 'SUCCESS') {
                        clearInterval(countdownInterval); 
                        clearInterval(serverPollingInterval); 
                        
                        document.getElementById('paymentInstructions').classList.add('hidden');
                        document.querySelector('.payment-icon').classList.add('hidden');
                        document.querySelector('.payment-card h2').classList.add('hidden');
                        document.querySelector('.payment-card p:first-of-type').classList.add('hidden');


                        serverStatusMessageDiv.style.display = 'block'; 
                        serverStatusMessageDiv.querySelector('p').textContent = "Pembayaran terkonfirmasi! Server Anda sedang dibuat...";
                        
                        const serverDetailPolling = setInterval(async () => {
                            const serverResponse = await fetch(`/api/get-server-details?order_id=${orderId}`);
                            const serverResult = await serverResponse.json();

                            if (serverResponse.ok && serverResult.server && serverResult.orderStatus === 'active') {
                                clearInterval(serverDetailPolling); 
                                serverStatusMessageDiv.style.display = 'none';
                                serverDetailsDiv.style.display = 'block';

                                document.getElementById('detailServerName').textContent = serverResult.server.name || 'N/A';
                                document.getElementById('detailUsername').textContent = serverResult.server.username || 'N/A';
                                document.getElementById('detailPassword').textContent = serverResult.server.password || 'N/A';
                                document.getElementById('detailPanelUrl').textContent = serverResult.server.panelUrl || 'N/A';
                                document.getElementById('detailPanelUrl').href = serverResult.server.panelUrl;
                                document.getElementById('detailIpAddress').textContent = serverResult.server.ipAddress || 'N/A';
                                document.getElementById('detailPort').textContent = serverResult.server.port || 'N/A';

                                document.getElementById('btnAccessPanel').href = serverResult.server.panelUrl;

                                document.querySelectorAll('.copy-btn').forEach(button => {
                                    button.addEventListener('click', async (e) => {
                                        const targetId = e.currentTarget.dataset.target;
                                        const textToCopy = document.getElementById(targetId).textContent;
                                        try {
                                            await navigator.clipboard.writeText(textToCopy);
                                            showCustomPopup(`'${textToCopy}' berhasil disalin!`, 'Disalin!', 'fas fa-clipboard-check', 'success');
                                        } catch (err) {
                                            console.error('Gagal menyalin: ', err);
                                            showCustomPopup('Gagal menyalin teks. Silakan salin secara manual.', 'Gagal Salin', 'fas fa-exclamation-circle', 'error');
                                        }
                                    });
                                });

                                document.getElementById('btnRestartServer').addEventListener('click', () => {
                                    showCustomPopup('Fitur Restart Server akan segera diaktifkan! Mohon tunggu update selanjutnya.', 'Fitur Coming Soon', 'fas fa-hammer', 'info');
                                });
                                document.getElementById('btnStopServer').addEventListener('click', () => {
                                    showCustomPopup('Fitur Stop Server akan segera diaktifkan! Mohon tunggu update selanjutnya.', 'Fitur Coming Soon', 'fas fa-hammer', 'info');
                                });

                            } else if (serverResult.orderStatus === 'waiting_payment' || serverResult.orderStatus === 'paid' || serverResult.orderStatus === 'challenge') { 
                                serverStatusMessageDiv.querySelector('i').className = 'fa-solid fa-spinner fa-spin';
                                serverStatusMessageDiv.querySelector('i').style.color = 'var(--accent-color)';
                                serverStatusMessageDiv.querySelector('p').textContent = `Memuat detail server (${serverResult.orderStatus.replace(/_/g, ' ')})...`;
                            } else {
                                clearInterval(serverDetailPolling); 
                                serverStatusMessageDiv.style.display = 'none';
                                paymentErrorMessageDiv.style.display = 'block';
                                paymentErrorMessageDiv.querySelector('p').textContent = `Maaf, terjadi masalah saat membuat server. Status: ${serverResult.orderStatus || 'Unknown'}. Mohon hubungi dukungan.`;
                                console.error('Gagal memuat detail server:', serverResult.message || 'Server data not found or not active.');
                            }
                        }, 5000); 
                        fetchServerDetailsAfterPayment();
                    } else if (statusResult.depositStatus === 'EXPIRED' || statusResult.depositStatus === 'FAILED' || statusResult.depositStatus === 'CANCELLED') {
                        clearInterval(countdownInterval);
                        clearInterval(serverPollingInterval);
                        paymentInstructionsDiv.classList.add('hidden');
                        paymentErrorMessageDiv.style.display = 'block';
                        paymentErrorMessageDiv.querySelector('p').textContent = `Deposit Anda (${statusResult.depositStatus}) sudah tidak aktif. Silakan buat pesanan baru. Order ID: ${orderId}`;
                        cancelDepositBtn.disabled = true;
                    } else {
                        serverStatusMessageDiv.style.display = 'block'; 
                        serverStatusMessageDiv.querySelector('i').className = 'fa-solid fa-spinner fa-spin';
                        serverStatusMessageDiv.querySelector('i').style.color = 'var(--accent-color)';
                        serverStatusMessageDiv.querySelector('p').textContent = `Menunggu pembayaran terkonfirmasi (${statusResult.depositStatus || 'PENDING'})...`;
                    }
                } catch (error) {
                    console.error('Error polling deposit status:', error);
                }
            }, 5000); 
        };
    }
});