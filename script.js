document.addEventListener('DOMContentLoaded', () => {
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
                alert('Layanan ini akan segera tersedia! Mohon bersabar ya.');
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
            alert('Tidak ada paket yang dipilih. Anda akan dialihkan kembali ke halaman utama.');
            window.location.href = 'index.html';
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
                                alert("Pembayaran berhasil!");
                                window.location.href = `/success.html?order_id=${midtransResult.order_id}`;
                            },
                            onPending: function(midtransResult){
                                alert("Pembayaran Anda dalam proses.");
                                window.location.href = `/pending.html?order_id=${midtransResult.order_id}`;
                            },
                            onError: function(midtransResult){
                                alert("Pembayaran gagal!");
                                window.location.href = `/error.html?order_id=${midtransResult.order_id}`;
                            },
                            onClose: function(){
                                alert('Anda menutup pop-up tanpa menyelesaikan pembayaran.');
                            }
                        });
                    } else {
                        alert('Midtrans Snap.js tidak dimuat. Pastikan Anda menambahkan script di checkout.html.');
                    }
                } else {
                    alert('Terjadi kesalahan saat membuat order: ' + (result.message || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error during checkout:', error);
                alert('Terjadi kesalahan koneksi. Silakan coba lagi.');
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
                        button.addEventListener('click', (e) => {
                            const targetId = e.currentTarget.dataset.target;
                            const textToCopy = document.getElementById(targetId).textContent;
                            navigator.clipboard.writeText(textToCopy).then(() => {
                                alert('Berhasil disalin: ' + textToCopy);
                            }).catch(err => {
                                console.error('Gagal menyalin: ', err);
                            });
                        });
                    });

                    document.getElementById('btnRestartServer').addEventListener('click', () => {
                        alert('Fitur Restart Server akan segera diaktifkan!');
                        // TODO: Implementasi fetch ke backend API Anda untuk restart server
                    });
                    document.getElementById('btnStopServer').addEventListener('click', () => {
                        alert('Fitur Stop Server akan segera diaktifkan!');
                        // TODO: Implementasi fetch ke backend API Anda untuk stop server
                    });


                } else if (response.ok && result.orderStatus === 'pending_payment') {
                    loadingMessageDiv.style.display = 'none';
                    errorMessageDiv.style.display = 'block';
                    errorMessageDiv.querySelector('p').textContent = 'Pembayaran Anda masih dalam proses atau belum terkonfirmasi. Harap tunggu beberapa saat atau hubungi dukungan kami.';
                    errorMessageDiv.querySelector('.btn').style.display = 'none';
                }
                else {
                    loadingMessageDiv.style.display = 'none';
                    errorMessageDiv.style.display = 'block';
                    console.error('Gagal memuat detail server:', result.message || 'Server data not found or not active.');
                }
            } catch (error) {
                console.error('Error fetching server details:', error);
                loadingMessageDiv.style.display = 'none';
                errorMessageDiv.style.display = 'block';
            }
        };

        // Berikan delay singkat jika Anda tahu server butuh waktu untuk dibuat
        setTimeout(fetchServerDetails, 5000); // Coba ambil detail setelah 5 detik
    }
});