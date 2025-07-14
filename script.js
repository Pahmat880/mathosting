document.addEventListener('DOMContentLoaded', () => {
    // --- Custom Pop-up Functionality ---
    const customPopup = document.getElementById('customPopup');
    const popupIcon = document.getElementById('popupIcon');
    const popupTitle = document.getElementById('popupTitle');
    const popupMessage = document.getElementById('popupMessage');
    const popupCloseBtn = document.getElementById('popupCloseBtn');

    // Fungsi untuk menampilkan pop-up kustom
    const showCustomPopup = (message, title = 'Notifikasi', iconClass = 'fas fa-info-circle', iconType = 'info', callback = null) => {
        popupIcon.className = `popup-icon ${iconClass} ${iconType}`; // Set ikon dan tipe warna
        popupTitle.textContent = title;
        popupMessage.textContent = message;
        customPopup.classList.add('show'); // Tampilkan overlay

        // Tambahkan event listener untuk tombol OK/Close
        const closeHandler = () => {
            customPopup.classList.remove('show'); // Sembunyikan overlay
            popupCloseBtn.removeEventListener('click', closeHandler); // Hapus listener agar tidak duplikat
            // Untuk memastikan tidak ada multiple event listener pada overlay itself
            customPopup.removeEventListener('click', overlayClickHandler); 

            if (callback) {
                callback(); // Panggil callback jika ada
            }
        };
        
        // Handler untuk klik di overlay (di luar konten pop-up)
        const overlayClickHandler = (e) => {
            if (e.target === customPopup) { 
                closeHandler();
            }
        };

        popupCloseBtn.addEventListener('click', closeHandler);
        customPopup.addEventListener('click', overlayClickHandler);
    };

    // --- Logic for index.html (Product Categories & Package Display) ---
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
                // Mengganti alert() dengan pop-up kustom
                showCustomPopup(
                    'Layanan ini akan segera tersedia! Mohon bersabar ya.',
                    'Coming Soon!',
                    'fas fa-hourglass-half', // Icon jam pasir
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
    const summaryDuration = document.getElementById('summaryDuration');
    const summaryBasePrice = document.getElementById('summaryBasePrice');
    const summaryDiscount = document.getElementById('summaryDiscount');
    const summaryTax = document.getElementById('summaryTax');
    const summaryTotalPrice = document.getElementById('summaryTotalPrice');
    const durationSelect = document.getElementById('duration');

    if (checkoutForm) {
        const selectedPackageData = JSON.parse(localStorage.getItem('selectedPackage'));

        if (!selectedPackageData) {
            // Mengganti alert() dengan pop-up kustom
            showCustomPopup(
                'Tidak ada paket yang dipilih. Anda akan dialihkan kembali ke halaman utama.',
                'Perhatian!',
                'fas fa-exclamation-triangle', // Icon peringatan
                'warning',
                () => { window.location.href = 'index.html'; } // Callback untuk redirect setelah OK
            );
            return;
        }

        document.getElementById('packageId').value = selectedPackageData.id;
        document.getElementById('packageName').value = selectedPackageData.name;
        document.getElementById('packagePrice').value = selectedPackageData.price;

        summaryPackageName.textContent = selectedPackageData.name;

        const updatePriceSummary = () => {
            const basePrice = selectedPackageData.price;
            const duration = parseInt(durationSelect.value);
            let discountPercentage = 0;

            if (duration === 3) {
                discountPercentage = 0.05;
            } else if (duration === 6) {
                discountPercentage = 0.10;
            } else if (duration === 12) {
                discountPercentage = 0.15;
            }

            const rawTotalPrice = basePrice * duration;
            const discountAmount = rawTotalPrice * discountPercentage;
            const finalPriceBeforeTax = rawTotalPrice - discountAmount;
            const taxAmount = 0;
            const finalTotalPrice = finalPriceBeforeTax + taxAmount;

            summaryDuration.textContent = `${duration} Bulan`;
            summaryBasePrice.textContent = `Rp ${basePrice.toLocaleString('id-ID')}`;
            summaryDiscount.textContent = `Rp ${discountAmount.toLocaleString('id-ID')}`;
            summaryTax.textContent = `Rp ${taxAmount.toLocaleString('id-ID')}`;
            summaryTotalPrice.textContent = `Rp ${finalTotalPrice.toLocaleString('id-ID')}`;
        };

        updatePriceSummary();
        durationSelect.addEventListener('change', updatePriceSummary);

        checkoutForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const formData = new FormData(checkoutForm);
            const data = Object.fromEntries(formData.entries());
            data.totalPrice = parseFloat(summaryTotalPrice.textContent.replace(/[^0-9,-]+/g, "").replace(",", "."));

            try {
                const response = await fetch('/api/create-order', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    console.log('Midtrans token:', result.snapToken);
                    if (typeof snap !== 'undefined') {
                        snap.pay(result.snapToken, {
                            onSuccess: function(midtransResult){
                                window.location.href = `/success.html?order_id=${midtransResult.order_id}`;
                            },
                            onPending: function(midtransResult){
                                showCustomPopup(
                                    'Pembayaran Anda dalam proses. Silakan selesaikan pembayaran melalui metode yang Anda pilih.',
                                    'Pembayaran Tertunda',
                                    'fas fa-hourglass-half', 
                                    'warning',
                                    () => { window.location.href = `/pending.html?order_id=${midtransResult.order_id}`; }
                                );
                            },
                            onError: function(midtransResult){
                                showCustomPopup(
                                    'Pembayaran gagal. Silakan coba metode pembayaran lain atau hubungi dukungan.',
                                    'Pembayaran Gagal',
                                    'fas fa-times-circle', 
                                    'error',
                                    () => { window.location.href = `/error.html?order_id=${midtransResult.order_id}`; }
                                );
                            },
                            onClose: function(){
                                showCustomPopup(
                                    'Anda menutup pop-up tanpa menyelesaikan pembayaran. Pesanan Anda belum diproses.',
                                    'Pembayaran Dibatalkan',
                                    'fas fa-info-circle', 
                                    'info'
                                );
                            }
                        });
                    } else {
                        showCustomPopup(
                            'Midtrans Snap.js tidak dimuat. Pastikan Anda menambahkan script di checkout.html dengan Client Key yang benar.',
                            'Error Konfigurasi',
                            'fas fa-exclamation-circle', 
                            'error'
                        );
                    }
                } else {
                    showCustomPopup(
                        'Terjadi kesalahan saat membuat order: ' + (result.message || 'Unknown error'),
                        'Order Gagal',
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

    // --- Logic for success.html (Display Server Details) ---
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('order_id');
    const serverDetailsDiv = document.getElementById('serverDetails');
    const loadingMessageDiv = document.getElementById('loadingMessage');
    const errorMessageDiv = document.getElementById('errorMessage');
    const errorOrderIdSpan = document.getElementById('errorOrderId');

    if (window.location.pathname.includes('success.html') && orderId) {
        loadingMessageDiv.style.display = 'block';
        serverDetailsDiv.style.display = 'none';
        errorMessageDiv.style.display = 'none';
        errorOrderIdSpan.textContent = orderId;

        const fetchServerDetails = async () => {
            try {
                const response = await fetch(`/api/get-server-details?order_id=${orderId}`);
                const result = await response.json();

                if (response.ok && result.server && result.orderStatus === 'active') {
                    document.getElementById('detailServerName').textContent = result.server.name || 'N/A';
                    document.getElementById('detailUsername').textContent = result.server.username || 'N/A';
                    document.getElementById('detailPassword').textContent = result.server.password || 'N/A';
                    document.getElementById('detailPanelUrl').textContent = result.server.panelUrl || 'N/A';
                    document.getElementById('detailPanelUrl').href = result.server.panelUrl;
                    document.getElementById('detailIpAddress').textContent = result.server.ipAddress || 'N/A';
                    document.getElementById('detailPort').textContent = result.server.port || 'N/A';

                    document.getElementById('btnAccessPanel').href = result.server.panelUrl;

                    loadingMessageDiv.style.display = 'none';
                    serverDetailsDiv.style.display = 'block';

                    document.querySelectorAll('.copy-btn').forEach(button => {
                        button.addEventListener('click', async (e) => { 
                            const targetId = e.currentTarget.dataset.target;
                            const textToCopy = document.getElementById(targetId).textContent;
                            try {
                                await navigator.clipboard.writeText(textToCopy);
                                showCustomPopup(
                                    `'${textToCopy}' berhasil disalin!`,
                                    'Disalin!',
                                    'fas fa-clipboard-check', 
                                    'success'
                                );
                            } catch (err) {
                                console.error('Gagal menyalin: ', err);
                                showCustomPopup(
                                    'Gagal menyalin teks. Silakan salin secara manual.',
                                    'Gagal Salin',
                                    'fas fa-exclamation-circle', 
                                    'error'
                                );
                            }
                        });
                    });

                    document.getElementById('btnRestartServer').addEventListener('click', () => {
                        showCustomPopup(
                            'Fitur Restart Server akan segera diaktifkan! Mohon tunggu update selanjutnya.',
                            'Fitur Coming Soon',
                            'fas fa-hammer', 
                            'info'
                        );
                    });
                    document.getElementById('btnStopServer').addEventListener('click', () => {
                        showCustomPopup(
                            'Fitur Stop Server akan segera diaktifkan! Mohon tunggu update selanjutnya.',
                            'Fitur Coming Soon',
                            'fas fa-hammer', 
                            'info'
                        );
                    });


                } else if (response.ok && (result.orderStatus === 'pending_payment' || result.orderStatus === 'paid' || result.orderStatus === 'challenge')) {
                    loadingMessageDiv.style.display = 'none';
                    errorMessageDiv.style.display = 'block';
                    errorMessageDiv.querySelector('p').textContent = `Pembayaran Anda masih dalam status "${result.orderStatus.replace('_', ' ')}". Harap tunggu beberapa saat atau hubungi dukungan kami.`;
                    errorMessageDiv.querySelector('.btn').style.display = 'block'; 
                }
                else {
                    loadingMessageDiv.style.display = 'none';
                    errorMessageDiv.style.display = 'block';
                    errorMessageDiv.querySelector('p').textContent = `Maaf, detail server tidak tersedia atau pesanan belum aktif. Status: ${result.orderStatus || 'Unknown'}. Mohon tunggu atau hubungi dukungan.`;
                    console.error('Gagal memuat detail server:', result.message || 'Server data not found or not active.');
                }
            } catch (error) {
                console.error('Error fetching server details:', error);
                loadingMessageDiv.style.display = 'none';
                errorMessageDiv.style.display = 'block';
                errorMessageDiv.querySelector('p').textContent = 'Terjadi kesalahan koneksi saat memuat detail server. Silakan coba lagi.';
            }
        };

        // Lakukan polling untuk detail server setiap beberapa detik
        const pollingInterval = setInterval(async () => {
            const response = await fetch(`/api/get-server-details?order_id=${orderId}`);
            const result = await response.json();
            if (result.orderStatus === 'active' && result.server) {
                clearInterval(pollingInterval); 
                fetchServerDetails(); 
            } else {
                console.log(`Polling: Server for order ${orderId} status is ${result.orderStatus || 'unknown'}. Retrying...`);
                loadingMessageDiv.querySelector('i').className = 'fa-solid fa-spinner fa-spin';
                loadingMessageDiv.querySelector('i').style.color = 'var(--accent-color)';
                loadingMessageDiv.querySelector('p').textContent = `Memuat detail server (${result.orderStatus ? result.orderStatus.replace(/_/g, ' ') : 'unknown'})...`;
            }
        }, 5000); 

        fetchServerDetails(); 
    }
});