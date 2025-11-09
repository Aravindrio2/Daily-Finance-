// Data Management
let customers = [];
const STORAGE_KEY = 'dailyFinanceCustomers';
const FIRESTORE_COLLECTION = 'dailyFinanceData';
const FIRESTORE_DOC = 'customers';

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    // Check if running on mobile and show helpful message if needed
    checkMobileCompatibility();
    
    // Wait a bit for Firebase to initialize
    setTimeout(() => {
        loadCustomers();
        setupEventListeners();
        setDefaultDate();
        setupMobileOptimizations();
        updateSyncStatus();
    }, 500);
});

// Check mobile compatibility and show warnings
function checkMobileCompatibility() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isLocalFile = window.location.protocol === 'file:';
    
    if (isMobile && isLocalFile) {
        // Show warning if trying to use file:// on mobile
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #ef4444;
            color: white;
            padding: 15px;
            text-align: center;
            z-index: 10000;
            font-weight: 600;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        warning.innerHTML = `
            ⚠️ This website needs to be hosted online to work on mobile! 
            <br>Upload to <a href="https://app.netlify.com/drop" target="_blank" style="color: #fbbf24; text-decoration: underline;">Netlify Drop</a> for free hosting.
        `;
        document.body.insertBefore(warning, document.body.firstChild);
        
        // Also log to console
        console.error('⚠️ Mobile detected but using file:// protocol. Website needs to be hosted online!');
        console.log('📤 Upload to https://app.netlify.com/drop for free hosting');
    }
    
    // Check for common mobile issues
    if (isMobile) {
        // Check if localStorage is available
        try {
            localStorage.setItem('test', 'test');
            localStorage.removeItem('test');
        } catch (e) {
            console.error('⚠️ localStorage not available:', e);
            alert('⚠️ Your browser may not support local storage. Some features may not work.');
        }
        
        // Check if camera is available (for photo upload)
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            console.log('✅ Camera API available');
        } else {
            console.warn('⚠️ Camera API not available. Photo upload may not work.');
        }
    }
}

// Setup mobile optimizations
function setupMobileOptimizations() {
    // Only apply mobile optimizations on touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        // Prevent double-tap zoom on buttons
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function(event) {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, false);

        // Improve touch scrolling
        document.body.style.cursor = 'pointer';

        // Prevent pull-to-refresh on mobile
        let touchStartY = 0;
        document.addEventListener('touchstart', function(e) {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        document.addEventListener('touchmove', function(e) {
            if (window.scrollY === 0 && e.touches[0].clientY > touchStartY) {
                e.preventDefault();
            }
        }, { passive: false });
    }

    // Desktop keyboard shortcuts
    setupKeyboardShortcuts();
}

// Setup keyboard shortcuts for desktop
function setupKeyboardShortcuts() {
    // Only enable on desktop (non-touch devices)
    if (!('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
        // Escape key to close modals
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const openModals = document.querySelectorAll('.modal[style*="display: block"]');
                openModals.forEach(modal => {
                    modal.style.display = 'none';
                });
            }
        });

        // Enter key to submit forms when focused
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.ctrlKey) {
                const focusedForm = document.activeElement.closest('form');
                if (focusedForm && focusedForm.querySelector('button[type="submit"]')) {
                    e.preventDefault();
                    focusedForm.querySelector('button[type="submit"]').click();
                }
            }
        });
    }
}

// Load customers from cloud or localStorage
async function loadCustomers() {
    updateSyncStatus('loading');
    
    if (window.useCloudSync && window.firebaseDb) {
        try {
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const dataRef = doc(window.firebaseDb, FIRESTORE_COLLECTION, FIRESTORE_DOC);
            const docSnap = await getDoc(dataRef);
            
            if (docSnap.exists()) {
                customers = docSnap.data().customers || [];
                // Also save to localStorage as backup
                localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
                updateSyncStatus('synced');
                console.log('✅ Loaded from cloud');
            } else {
                // No cloud data, try localStorage
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    customers = JSON.parse(stored);
                    // Upload to cloud
                    await saveCustomers();
                }
                updateSyncStatus('synced');
            }
            
            // Set up real-time listener for changes from other devices
            setupRealtimeListener();
        } catch (error) {
            console.error('Error loading from cloud:', error);
            // Fallback to localStorage
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                customers = JSON.parse(stored);
            }
            updateSyncStatus('error');
        }
    } else {
        // Use localStorage only
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            customers = JSON.parse(stored);
        }
        updateSyncStatus('local');
    }
    
    const currentSearch = document.getElementById('customerSearch')?.value || '';
    renderCustomers(currentSearch);
}

// Save customers to cloud and localStorage
async function saveCustomers() {
    // Always save to localStorage first (fast)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
    
    // Then sync to cloud if enabled
    if (window.useCloudSync && window.firebaseDb) {
        try {
            updateSyncStatus('syncing');
            const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
            const dataRef = doc(window.firebaseDb, FIRESTORE_COLLECTION, FIRESTORE_DOC);
            await setDoc(dataRef, {
                customers: customers,
                lastUpdated: new Date().toISOString()
            }, { merge: false });
            updateSyncStatus('synced');
            console.log('✅ Saved to cloud');
        } catch (error) {
            console.error('Error saving to cloud:', error);
            updateSyncStatus('error');
        }
    }
    
    const currentSearch = document.getElementById('customerSearch')?.value || '';
    renderCustomers(currentSearch);
}

// Setup real-time listener for changes from other devices
async function setupRealtimeListener() {
    if (!window.useCloudSync || !window.firebaseDb) return;
    
    try {
        const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const dataRef = doc(window.firebaseDb, FIRESTORE_COLLECTION, FIRESTORE_DOC);
        
        onSnapshot(dataRef, (docSnap) => {
            if (docSnap.exists()) {
                const cloudData = docSnap.data().customers || [];
                const cloudLastUpdated = docSnap.data().lastUpdated;
                
                // Check if cloud data is newer
                const localLastUpdated = localStorage.getItem('lastUpdated');
                if (!localLastUpdated || cloudLastUpdated > localLastUpdated) {
                    // Update local data
                    customers = cloudData;
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
                    localStorage.setItem('lastUpdated', cloudLastUpdated);
                    
                    const currentSearch = document.getElementById('customerSearch')?.value || '';
                    renderCustomers(currentSearch);
                    updateSyncStatus('synced');
                    console.log('🔄 Synced from cloud (real-time update)');
                }
            }
        }, (error) => {
            console.error('Realtime listener error:', error);
            updateSyncStatus('error');
        });
    } catch (error) {
        console.error('Error setting up realtime listener:', error);
    }
}

// Update sync status indicator
function updateSyncStatus(status) {
    const syncStatus = document.getElementById('syncStatus');
    const syncIcon = document.getElementById('syncIcon');
    const syncText = document.getElementById('syncText');
    
    if (!syncStatus || !syncIcon || !syncText) return;
    
    // Hide sync status if using local storage only
    if (status === 'local' && !window.useCloudSync) {
        syncStatus.style.display = 'none';
        return;
    }
    
    // Show sync status for cloud sync
    syncStatus.style.display = 'flex';
    
    switch(status) {
        case 'loading':
            syncIcon.textContent = '⏳';
            syncText.textContent = 'Loading...';
            syncStatus.className = 'sync-status syncing';
            break;
        case 'syncing':
            syncIcon.textContent = '🔄';
            syncText.textContent = 'Syncing...';
            syncStatus.className = 'sync-status syncing';
            break;
        case 'synced':
            syncIcon.textContent = '✅';
            syncText.textContent = 'Synced';
            syncStatus.className = 'sync-status synced';
            setTimeout(() => {
                if (window.useCloudSync) {
                    syncIcon.textContent = '☁️';
                    syncText.textContent = 'Cloud';
                } else {
                    // Hide if local
                    syncStatus.style.display = 'none';
                }
                syncStatus.className = 'sync-status';
            }, 2000);
            break;
        case 'error':
            syncIcon.textContent = '⚠️';
            syncText.textContent = 'Error';
            syncStatus.className = 'sync-status error';
            break;
        case 'local':
        default:
            // Hide local status
            syncStatus.style.display = 'none';
            break;
    }
}

// Set default date to today for payment form
function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('paymentDate').value = today;
}

// Setup event listeners
function setupEventListeners() {
    // Customer form
    document.getElementById('customerForm').addEventListener('submit', handleCustomerSubmit);
    document.getElementById('cancelBtn').addEventListener('click', resetCustomerForm);
    
    // Payment form
    document.getElementById('paymentForm').addEventListener('submit', handlePaymentSubmit);
    
    // Quick submit on Enter key in payment amount
    document.getElementById('paymentAmount').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && this.value) {
            e.preventDefault();
            document.getElementById('paymentForm').dispatchEvent(new Event('submit'));
        }
    });
    
    // Export button
    document.getElementById('exportBtn').addEventListener('click', exportToPDF);
    
    // Search functionality
    document.getElementById('customerSearch').addEventListener('input', handleSearch);
    document.getElementById('clearSearch').addEventListener('click', clearSearch);
    
    // Modal close buttons
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });
    
    document.getElementById('closePaymentModal').addEventListener('click', function() {
        document.getElementById('paymentModal').style.display = 'none';
    });
    
    // Bulk payment form (Consecutive Days)
    document.getElementById('bulkPaymentForm').addEventListener('submit', handleBulkPaymentSubmit);
    document.getElementById('closeBulkPaymentModal').addEventListener('click', function() {
        document.getElementById('bulkPaymentModal').style.display = 'none';
    });
    
    // Preview bulk payments (Consecutive Days)
    document.getElementById('bulkStartDate').addEventListener('change', previewBulkPayments);
    document.getElementById('bulkDays').addEventListener('input', previewBulkPayments);
    document.getElementById('bulkAmount').addEventListener('input', previewBulkPayments);
    
    // Flexible bulk payment form
    document.getElementById('flexibleBulkPaymentForm').addEventListener('submit', handleFlexibleBulkPaymentSubmit);
    document.getElementById('closeFlexibleBulkPaymentModal').addEventListener('click', function() {
        document.getElementById('flexibleBulkPaymentModal').style.display = 'none';
        clearAllPaymentRows();
    });
    
    // Edit payment form
    document.getElementById('editPaymentForm').addEventListener('submit', handleEditPaymentSubmit);
    document.getElementById('closeEditPaymentModal').addEventListener('click', function() {
        document.getElementById('editPaymentModal').style.display = 'none';
    });
    
    // Bulk update form
    document.getElementById('bulkUpdateForm').addEventListener('submit', handleBulkUpdateSubmit);
    document.getElementById('closeBulkUpdateModal').addEventListener('click', function() {
        document.getElementById('bulkUpdateModal').style.display = 'none';
    });
    
    // Preview bulk update
    document.getElementById('updateAllAmount').addEventListener('input', previewBulkUpdate);
}

// Update plan fields visibility
function updatePlanFields() {
    const plan = document.getElementById('paymentPlan').value;
    const customDaysGroup = document.getElementById('customDaysGroup');
    const dailyAmountGroup = document.getElementById('dailyAmountGroup');
    const planStartDateGroup = document.getElementById('planStartDateGroup');
    const planPreview = document.getElementById('planPreview');
    
    if (plan === 'none') {
        customDaysGroup.style.display = 'none';
        dailyAmountGroup.style.display = 'none';
        planStartDateGroup.style.display = 'none';
        planPreview.style.display = 'none';
    } else {
        dailyAmountGroup.style.display = 'block';
        planStartDateGroup.style.display = 'block';
        planPreview.style.display = 'block';
        
        if (plan === 'custom') {
            customDaysGroup.style.display = 'block';
        } else {
            customDaysGroup.style.display = 'none';
        }
        
        updatePlanPreview();
    }
}

// Update plan preview
function updatePlanPreview() {
    const plan = document.getElementById('paymentPlan').value;
    const dailyAmount = parseFloat(document.getElementById('dailyAmount').value) || 0;
    const startDate = document.getElementById('planStartDate').value;
    const customDays = parseInt(document.getElementById('customDays').value) || 0;
    
    const planPreview = document.getElementById('planPreview');
    
    if (plan === 'none' || !dailyAmount || !startDate) {
        planPreview.innerHTML = '';
        return;
    }
    
    let days = 0;
    if (plan === '10') days = 10;
    else if (plan === '30') days = 30;
    else if (plan === 'custom') days = customDays;
    
    if (days > 0 && dailyAmount > 0 && startDate) {
        const totalAmount = days * dailyAmount;
        let html = '<div class="plan-preview-content">';
        html += `<h4>📅 Payment Plan Preview</h4>`;
        html += `<div class="preview-stats">`;
        html += `<div class="preview-stat"><span>Duration:</span> <strong>${days} days</strong></div>`;
        html += `<div class="preview-stat"><span>Daily Amount:</span> <strong>₹${dailyAmount.toFixed(2)}</strong></div>`;
        html += `<div class="preview-stat"><span>Total Amount:</span> <strong>₹${totalAmount.toFixed(2)}</strong></div>`;
        html += `</div>`;
        html += `<p class="preview-note">✅ ${days} payment entries will be created automatically starting from ${new Date(startDate).toLocaleDateString('en-IN')}</p>`;
        html += `</div>`;
        planPreview.innerHTML = html;
    } else {
        planPreview.innerHTML = '';
    }
}

// Add event listeners for plan preview
document.addEventListener('DOMContentLoaded', function() {
    // This will be called after the initial setup
    setTimeout(() => {
        const dailyAmountInput = document.getElementById('dailyAmount');
        const planStartDateInput = document.getElementById('planStartDate');
        const customDaysInput = document.getElementById('customDays');
        
        if (dailyAmountInput) {
            dailyAmountInput.addEventListener('input', updatePlanPreview);
        }
        if (planStartDateInput) {
            planStartDateInput.addEventListener('change', updatePlanPreview);
            // Set default to today
            planStartDateInput.value = new Date().toISOString().split('T')[0];
        }
        if (customDaysInput) {
            customDaysInput.addEventListener('input', updatePlanPreview);
        }
    }, 100);
});

// Handle customer form submission
function handleCustomerSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('customerId').value;
    const name = document.getElementById('customerName').value.trim();
    const area = document.getElementById('customerArea').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const loanAmount = parseFloat(document.getElementById('loanAmount').value);
    const paymentPlan = document.getElementById('paymentPlan').value;
    
    if (id) {
        // Edit existing customer
        const customer = customers.find(c => c.id === id);
        if (customer) {
            customer.name = name;
            customer.area = area;
            customer.phone = phone;
            customer.loanAmount = loanAmount;
        }
    } else {
        // Add new customer
        const newCustomer = {
            id: Date.now().toString(),
            name: name,
            area: area,
            phone: phone,
            loanAmount: loanAmount,
            payments: []
        };
        
        // Auto-create payment entries if plan is selected
        if (paymentPlan !== 'none') {
            const dailyAmount = parseFloat(document.getElementById('dailyAmount').value);
            const startDate = document.getElementById('planStartDate').value;
            let days = 0;
            
            if (paymentPlan === '10') days = 10;
            else if (paymentPlan === '30') days = 30;
            else if (paymentPlan === 'custom') {
                days = parseInt(document.getElementById('customDays').value) || 0;
            }
            
            if (days > 0 && dailyAmount > 0 && startDate) {
                const start = new Date(startDate);
                for (let i = 0; i < days; i++) {
                    const currentDate = new Date(start);
                    currentDate.setDate(start.getDate() + i);
                    const dateStr = currentDate.toISOString().split('T')[0];
                    
                    newCustomer.payments.push({
                        date: dateStr,
                        amount: dailyAmount
                    });
                }
            }
        }
        
        customers.push(newCustomer);
    }
    
    saveCustomers();
    resetCustomerForm();
}

// Reset customer form
function resetCustomerForm() {
    document.getElementById('customerForm').reset();
    document.getElementById('customerId').value = '';
    document.getElementById('formTitle').textContent = 'Add New Customer';
    document.getElementById('submitBtn').textContent = 'Add Customer';
    document.getElementById('cancelBtn').style.display = 'none';
    document.getElementById('customDaysGroup').style.display = 'none';
    document.getElementById('dailyAmountGroup').style.display = 'none';
    document.getElementById('planStartDateGroup').style.display = 'none';
    document.getElementById('planPreview').style.display = 'none';
    // Set default start date to today
    document.getElementById('planStartDate').value = new Date().toISOString().split('T')[0];
}

// Edit customer
function editCustomer(id) {
    const customer = customers.find(c => c.id === id);
    if (customer) {
        document.getElementById('customerId').value = customer.id;
        document.getElementById('customerName').value = customer.name;
        document.getElementById('customerArea').value = customer.area;
        document.getElementById('customerPhone').value = customer.phone;
        document.getElementById('loanAmount').value = customer.loanAmount;
        document.getElementById('formTitle').textContent = 'Edit Customer';
        document.getElementById('submitBtn').textContent = 'Update Customer';
        document.getElementById('cancelBtn').style.display = 'inline-block';
        
        // Scroll to form
        document.querySelector('.customer-form-section').scrollIntoView({ behavior: 'smooth' });
    }
}

// Delete customer
function deleteCustomer(id) {
    if (confirm('Are you sure you want to delete this customer? All payment history will be lost.')) {
        customers = customers.filter(c => c.id !== id);
        saveCustomers();
    }
}

// Add payment
function addPayment(id) {
    const customer = customers.find(c => c.id === id);
    document.getElementById('paymentCustomerId').value = id;
    setDefaultDate();
    
    // Suggest amount based on last payment
    if (customer) {
        const lastAmount = getLastPaymentAmount(customer);
        if (lastAmount) {
            document.getElementById('paymentAmount').value = lastAmount.toFixed(2);
        }
        document.getElementById('paymentInfoText').textContent = `Adding payment for ${customer.name}`;
    }
    
    document.getElementById('paymentModal').style.display = 'block';
    document.getElementById('paymentAmount').focus();
    document.getElementById('paymentAmount').select();
}

// Set quick date
function setQuickDate(period) {
    const dateInput = document.getElementById('paymentDate');
    const today = new Date();
    
    if (period === 'today') {
        dateInput.value = today.toISOString().split('T')[0];
    } else if (period === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        dateInput.value = yesterday.toISOString().split('T')[0];
    } else if (period === '2days') {
        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        dateInput.value = twoDaysAgo.toISOString().split('T')[0];
    }
}

// Handle payment form submission
function handlePaymentSubmit(e) {
    e.preventDefault();
    
    const customerId = document.getElementById('paymentCustomerId').value;
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    const date = document.getElementById('paymentDate').value;
    
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
        customer.payments.push({
            date: date,
            amount: amount
        });
        // Sort payments by date
        customer.payments.sort((a, b) => new Date(a.date) - new Date(b.date));
        saveCustomers();
        document.getElementById('paymentForm').reset();
        document.getElementById('paymentModal').style.display = 'none';
        setDefaultDate();
    }
}

// Get day name from date
function getDayName(dateString) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const date = new Date(dateString);
    return days[date.getDay()];
}

// Format date with day name (e.g., "5.11.23, Monday")
function formatDateWithDay(dateString) {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear().toString().slice(-2);
    const dayName = getDayName(dateString);
    return `${day}.${month}.${year}, ${dayName}`;
}

// View payment history
function viewHistory(id) {
    const customer = customers.find(c => c.id === id);
    if (customer) {
        const historyContent = document.getElementById('historyContent');
        const totalPaid = calculateTotalPaid(customer);
        const pending = customer.loanAmount - totalPaid;
        
        // Customer Summary Card
        let html = `<div class="history-summary-card">
            <div class="summary-header">
                <h3>👤 ${customer.name}</h3>
                <span class="customer-badge">${customer.area}</span>
            </div>
            <div class="summary-grid">
                <div class="summary-item">
                    <span class="summary-label">Phone</span>
                    <span class="summary-value">${customer.phone}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Loan Amount</span>
                    <span class="summary-value loan-amount">₹${customer.loanAmount.toFixed(2)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Total Paid</span>
                    <span class="summary-value paid-highlight">₹${totalPaid.toFixed(2)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Balance Amount</span>
                    <span class="summary-value balance-highlight">₹${pending.toFixed(2)}</span>
                </div>
            </div>
        </div>`;
        
        // Payment History Section
        if (customer.payments.length > 0) {
            // Sort payments by date (newest first)
            const sortedPayments = [...customer.payments].sort((a, b) => new Date(b.date) - new Date(a.date));
            
            html += `<div class="history-section">
                <div class="history-header">
                    <h4>📋 Complete Payment History</h4>
                    <span class="payment-count">Total: ${customer.payments.length} payment(s)</span>
                </div>`;
            
            html += '<table class="history-table">';
            html += '<thead><tr><th>#</th><th>Date & Day</th><th>Amount</th><th>Actions</th></tr></thead><tbody>';
            
            sortedPayments.forEach((payment, index) => {
                const dateWithDay = formatDateWithDay(payment.date);
                const originalIndex = customer.payments.findIndex(p => 
                    p.date === payment.date && p.amount === payment.amount
                );
                html += `<tr>
                    <td class="payment-number">${index + 1}</td>
                    <td class="payment-date"><strong>${dateWithDay}</strong></td>
                    <td class="payment-amount">₹${payment.amount.toFixed(2)}</td>
                    <td class="payment-actions">
                        <button class="btn btn-warning btn-sm" onclick="editPayment('${id}', ${originalIndex})" title="Edit payment">✏️ Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deletePayment('${id}', ${originalIndex})" title="Delete payment">🗑️ Delete</button>
                    </td>
                </tr>`;
            });
            
            html += '</tbody></table>';
            
            // Payment Statistics
            const avgPayment = totalPaid / customer.payments.length;
            const maxPayment = Math.max(...customer.payments.map(p => p.amount));
            const minPayment = Math.min(...customer.payments.map(p => p.amount));
            
            html += `<div class="payment-stats">
                <h4>📊 Payment Statistics</h4>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">Average Payment</span>
                        <span class="stat-value">₹${avgPayment.toFixed(2)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Highest Payment</span>
                        <span class="stat-value">₹${maxPayment.toFixed(2)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Lowest Payment</span>
                        <span class="stat-value">₹${minPayment.toFixed(2)}</span>
                    </div>
                </div>
            </div>`;
            
            html += `</div>`;
        } else {
            html += `<div class="no-payments">
                <div class="no-payments-icon">💳</div>
                <h4>No Payments Recorded</h4>
                <p>This customer hasn't made any payments yet.</p>
                <button class="btn btn-success" onclick="document.getElementById('historyModal').style.display='none'; addPayment('${id}');">Add First Payment</button>
            </div>`;
        }
        
        historyContent.innerHTML = html;
        document.getElementById('historyModal').style.display = 'block';
    }
}

// Edit individual payment
function editPayment(customerId, paymentIndex) {
    const customer = customers.find(c => c.id === customerId);
    if (customer && customer.payments[paymentIndex]) {
        const payment = customer.payments[paymentIndex];
        document.getElementById('editPaymentCustomerId').value = customerId;
        document.getElementById('editPaymentIndex').value = paymentIndex;
        document.getElementById('editPaymentAmount').value = payment.amount;
        document.getElementById('editPaymentDate').value = payment.date;
        document.getElementById('editPaymentModal').style.display = 'block';
    }
}

// Handle edit payment form submission
function handleEditPaymentSubmit(e) {
    e.preventDefault();
    
    const customerId = document.getElementById('editPaymentCustomerId').value;
    const paymentIndex = parseInt(document.getElementById('editPaymentIndex').value);
    const amount = parseFloat(document.getElementById('editPaymentAmount').value);
    const date = document.getElementById('editPaymentDate').value;
    
    const customer = customers.find(c => c.id === customerId);
    if (customer && customer.payments[paymentIndex]) {
        customer.payments[paymentIndex].amount = amount;
        customer.payments[paymentIndex].date = date;
        
        // Sort payments by date after edit
        customer.payments.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        saveCustomers();
        document.getElementById('editPaymentForm').reset();
        document.getElementById('editPaymentModal').style.display = 'none';
        
        // Refresh the history view
        viewHistory(customerId);
    }
}

// Delete individual payment
function deletePayment(customerId, paymentIndex) {
    const customer = customers.find(c => c.id === customerId);
    if (customer && customer.payments[paymentIndex]) {
        const payment = customer.payments[paymentIndex];
        const dateWithDay = formatDateWithDay(payment.date);
        
        if (confirm(`Are you sure you want to delete the payment of ₹${payment.amount.toFixed(2)} on ${dateWithDay}?`)) {
            customer.payments.splice(paymentIndex, 1);
            saveCustomers();
            
            // Refresh the history view
            viewHistory(customerId);
        }
    }
}

// Calculate total paid amount
function calculateTotalPaid(customer) {
    return customer.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

// Check if customer has paid today
function hasPaidToday(customer) {
    const today = new Date().toISOString().split('T')[0];
    return customer.payments.some(payment => payment.date === today);
}

// Get today's payment amount if exists
function getTodayPayment(customer) {
    const today = new Date().toISOString().split('T')[0];
    const todayPayment = customer.payments.find(payment => payment.date === today);
    return todayPayment ? todayPayment.amount : null;
}

// Get last payment amount (to suggest today's amount)
function getLastPaymentAmount(customer) {
    if (customer.payments.length === 0) return null;
    const sortedPayments = [...customer.payments].sort((a, b) => new Date(b.date) - new Date(a.date));
    return sortedPayments[0].amount;
}

// Quick pay today
function quickPayToday(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    const today = new Date().toISOString().split('T')[0];
    const lastAmount = getLastPaymentAmount(customer);
    const suggestedAmount = lastAmount || (customer.loanAmount / 100); // Default to 1% of loan or last payment
    
    document.getElementById('paymentCustomerId').value = customerId;
    document.getElementById('paymentDate').value = today;
    document.getElementById('paymentAmount').value = suggestedAmount.toFixed(2);
    document.getElementById('paymentModal').style.display = 'block';
    document.getElementById('paymentAmount').focus();
    document.getElementById('paymentAmount').select();
}

// Handle search
function handleSearch() {
    const searchTerm = document.getElementById('customerSearch').value.toLowerCase().trim();
    const clearBtn = document.getElementById('clearSearch');
    
    if (searchTerm) {
        clearBtn.style.display = 'block';
    } else {
        clearBtn.style.display = 'none';
    }
    
    renderCustomers(searchTerm);
}

// Clear search
function clearSearch() {
    document.getElementById('customerSearch').value = '';
    document.getElementById('clearSearch').style.display = 'none';
    renderCustomers('');
}

// Filter customers by search term
function filterCustomers(searchTerm) {
    if (!searchTerm) return customers;
    
    return customers.filter(customer => {
        const name = customer.name.toLowerCase();
        const area = customer.area.toLowerCase();
        const phone = customer.phone.toLowerCase();
        const search = searchTerm.toLowerCase();
        
        return name.includes(search) || 
               area.includes(search) || 
               phone.includes(search);
    });
}

// Render customers table
function renderCustomers(searchTerm = '') {
    const tbody = document.getElementById('customersTableBody');
    const mobileCardView = document.getElementById('mobileCardView');
    tbody.innerHTML = '';
    mobileCardView.innerHTML = '';
    
    const filteredCustomers = filterCustomers(searchTerm);
    const searchInfo = document.getElementById('searchResultsInfo');
    
    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px; color: #999;">No customers added yet. Add your first customer above.</td></tr>';
        mobileCardView.innerHTML = '<div class="no-customers-mobile">No customers added yet. Add your first customer above.</div>';
        searchInfo.innerHTML = '';
        return;
    }
    
    // Show search results info
    if (searchTerm) {
        if (filteredCustomers.length === 0) {
            searchInfo.innerHTML = `<div class="search-no-results">No customers found matching "${searchTerm}"</div>`;
        } else {
            searchInfo.innerHTML = `<div class="search-results-found">Found ${filteredCustomers.length} customer(s) matching "${searchTerm}"</div>`;
        }
    } else {
        searchInfo.innerHTML = '';
    }
    
    if (filteredCustomers.length === 0 && searchTerm) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px; color: #999;">No customers found matching your search.</td></tr>';
        mobileCardView.innerHTML = '<div class="no-customers-mobile">No customers found matching your search.</div>';
        return;
    }
    
    filteredCustomers.forEach(customer => {
        const totalPaid = calculateTotalPaid(customer);
        const pending = customer.loanAmount - totalPaid;
        const paidToday = hasPaidToday(customer);
        const todayAmount = getTodayPayment(customer);
        const lastAmount = getLastPaymentAmount(customer);
        
        // Determine today's status
        let todayStatus = '';
        let statusClass = '';
        if (paidToday && todayAmount) {
            todayStatus = `✅ Paid ₹${todayAmount.toFixed(2)}`;
            statusClass = 'status-paid';
        } else {
            const suggestedAmount = lastAmount || (customer.loanAmount / 100);
            todayStatus = `⚠️ Due ~₹${suggestedAmount.toFixed(2)}`;
            statusClass = 'status-due';
        }
        
        // Desktop table row
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${customer.name}</strong></td>
            <td>${customer.area}</td>
            <td>${customer.phone}</td>
            <td>₹${customer.loanAmount.toFixed(2)}</td>
            <td class="paid-amount">₹${totalPaid.toFixed(2)}</td>
            <td class="balance-amount">₹${pending.toFixed(2)}</td>
            <td class="${statusClass}">
                <div class="today-status">${todayStatus}</div>
            </td>
            <td>
                <div class="action-buttons">
                    ${!paidToday ? `<button class="btn btn-success btn-quick-pay" onclick="quickPayToday('${customer.id}')" title="Quick Pay Today">💰 Pay Today</button>` : ''}
                    <button class="btn btn-success" onclick="addPayment('${customer.id}')">Add Payment</button>
                    <button class="btn btn-primary" onclick="addBulkPayment('${customer.id}')" title="Consecutive days with same amount">📅 Bulk (Fixed)</button>
                    <button class="btn btn-primary" onclick="addFlexibleBulkPayment('${customer.id}')" title="Different dates with different amounts">💵 Flexible Bulk</button>
                    ${customer.payments.length > 0 ? `<button class="btn btn-update" onclick="bulkUpdateAllPayments('${customer.id}')" title="Update all payment amounts">⚡ Update All</button>` : ''}
                    <button class="btn btn-info" onclick="viewHistory('${customer.id}')">History</button>
                    <button class="btn btn-details" onclick="sendPaymentDetails('${customer.id}')" title="Send complete payment details">📋 Send Details</button>
                    <button class="btn btn-pdf" onclick="exportCustomerPDF('${customer.id}')" title="Download payment details PDF">📄 Download PDF</button>
                    ${pending > 0 ? `<button class="btn btn-whatsapp" onclick="sendWhatsAppMessage('${customer.id}')" title="Send WhatsApp reminder">📱 Reminder</button>` : ''}
                    <button class="btn btn-warning" onclick="editCustomer('${customer.id}')">Edit</button>
                    <button class="btn btn-danger" onclick="deleteCustomer('${customer.id}')">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
        
        // Mobile card
        const mobileCardView = document.getElementById('mobileCardView');
        const card = document.createElement('div');
        card.className = 'customer-card';
        card.innerHTML = `
            <div class="card-header">
                <h3>${customer.name}</h3>
                <span class="card-status ${statusClass}">${todayStatus}</span>
            </div>
            <div class="card-body">
                <div class="card-row">
                    <span class="card-label">Area:</span>
                    <span class="card-value">${customer.area}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">Phone:</span>
                    <span class="card-value">${customer.phone}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">Loan Amount:</span>
                    <span class="card-value">₹${customer.loanAmount.toFixed(2)}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">Total Paid:</span>
                    <span class="card-value paid-amount">₹${totalPaid.toFixed(2)}</span>
                </div>
                <div class="card-balance">
                    <span class="card-label">Balance Amount:</span>
                    <span class="balance-amount-large">₹${pending.toFixed(2)}</span>
                </div>
            </div>
            <div class="card-actions">
                ${!paidToday ? `<button class="btn btn-success btn-quick-pay" onclick="quickPayToday('${customer.id}')">💰 Pay Today</button>` : ''}
                <button class="btn btn-success" onclick="addPayment('${customer.id}')">Add Payment</button>
                <button class="btn btn-primary" onclick="addBulkPayment('${customer.id}')" title="Consecutive days">📅 Bulk</button>
                <button class="btn btn-primary" onclick="addFlexibleBulkPayment('${customer.id}')" title="Flexible dates">💵 Flex</button>
                ${customer.payments.length > 0 ? `<button class="btn btn-update" onclick="bulkUpdateAllPayments('${customer.id}')">⚡ Update</button>` : ''}
                <button class="btn btn-info" onclick="viewHistory('${customer.id}')">History</button>
                <button class="btn btn-details" onclick="sendPaymentDetails('${customer.id}')">📋 Details</button>
                <button class="btn btn-pdf" onclick="exportCustomerPDF('${customer.id}')">📄 PDF</button>
                ${pending > 0 ? `<button class="btn btn-whatsapp" onclick="sendWhatsAppMessage('${customer.id}')">📱</button>` : ''}
                <button class="btn btn-warning" onclick="editCustomer('${customer.id}')">Edit</button>
                <button class="btn btn-danger" onclick="deleteCustomer('${customer.id}')">Delete</button>
            </div>
        `;
        mobileCardView.appendChild(card);
    });
}

// Add bulk payment (Consecutive Days - Fixed Amount)
function addBulkPayment(id) {
    const customer = customers.find(c => c.id === id);
    document.getElementById('bulkPaymentCustomerId').value = id;
    document.getElementById('bulkPaymentModal').style.display = 'block';
    setDefaultDate();
    document.getElementById('bulkStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('bulkDays').value = '';
    document.getElementById('bulkAmount').value = '';
    document.getElementById('bulkPreview').innerHTML = '';
    
    // Suggest last payment amount if available
    if (customer && customer.payments.length > 0) {
        const lastAmount = getLastPaymentAmount(customer);
        if (lastAmount) {
            document.getElementById('bulkAmount').value = lastAmount.toFixed(2);
        }
    }
    
    document.getElementById('bulkStartDate').focus();
}

// Add flexible bulk payment - Opens flexible payment modal
function addFlexibleBulkPayment(id) {
    const customer = customers.find(c => c.id === id);
    document.getElementById('flexibleBulkPaymentCustomerId').value = id;
    document.getElementById('flexibleBulkPaymentModal').style.display = 'block';
    
    // Reset to manual mode
    switchBulkMode('manual');
    
    // Clear existing rows and add first row
    clearAllPaymentRows();
    addPaymentRow();
    
    // Suggest last payment amount if available
    if (customer && customer.payments.length > 0) {
        const lastAmount = getLastPaymentAmount(customer);
        if (lastAmount) {
            const firstAmountInput = document.querySelector('.payment-row-amount');
            if (firstAmountInput) {
                firstAmountInput.value = lastAmount.toFixed(2);
            }
        }
    }
    
    // Set default date to today for first row
    const firstDateInput = document.querySelector('.payment-row-date');
    if (firstDateInput) {
        firstDateInput.value = new Date().toISOString().split('T')[0];
    }
    
    // Focus on first amount input
    setTimeout(() => {
        const firstAmountInput = document.querySelector('.payment-row-amount');
        if (firstAmountInput) {
            firstAmountInput.focus();
            firstAmountInput.select();
        }
    }, 100);
}

// Switch between manual and import modes
function switchBulkMode(mode) {
    const manualMode = document.getElementById('manualEntryMode');
    const importMode = document.getElementById('importMode');
    const manualBtn = document.getElementById('manualModeBtn');
    const importBtn = document.getElementById('importModeBtn');
    
    if (mode === 'manual') {
        manualMode.style.display = 'block';
        importMode.style.display = 'none';
        manualBtn.classList.add('active');
        importBtn.classList.remove('active');
    } else {
        manualMode.style.display = 'none';
        importMode.style.display = 'block';
        manualBtn.classList.remove('active');
        importBtn.classList.add('active');
        // Focus on textarea
        setTimeout(() => {
            document.getElementById('bulkImportText').focus();
        }, 100);
    }
}

// Parse date string in various formats (enhanced for notes/photos)
function parseDate(dateStr) {
    if (!dateStr) return null;
    
    // Remove extra spaces and common OCR errors
    dateStr = dateStr.trim()
        .replace(/[Oo]/g, '0')  // OCR: O -> 0
        .replace(/[Il1]/g, '1')  // OCR: I/l -> 1
        .replace(/[S5]/g, '5')   // OCR: S -> 5
        .replace(/[Z2]/g, '2');  // OCR: Z -> 2
    
    // Try ISO format (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
    }
    
    // Try DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyy = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (ddmmyyyy) {
        const day = parseInt(ddmmyyyy[1]);
        const month = parseInt(ddmmyyyy[2]);
        const year = parseInt(ddmmyyyy[3]);
        if (day > 0 && day <= 31 && month > 0 && month <= 12) {
            const date = new Date(year, month - 1, day);
            if (!isNaN(date.getTime()) && date.getDate() === day && date.getMonth() === month - 1) {
                return date.toISOString().split('T')[0];
            }
        }
    }
    
    // Try MM/DD/YYYY or MM-DD-YYYY
    const mmddyyyy = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (mmddyyyy) {
        const month = parseInt(mmddyyyy[1]);
        const day = parseInt(mmddyyyy[2]);
        const year = parseInt(mmddyyyy[3]);
        if (day > 0 && day <= 31 && month > 0 && month <= 12) {
            const date = new Date(year, month - 1, day);
            if (!isNaN(date.getTime()) && date.getDate() === day && date.getMonth() === month - 1) {
                return date.toISOString().split('T')[0];
            }
        }
    }
    
    // Try DD/MM/YY or DD-MM-YY (2-digit year)
    const ddmmyy = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
    if (ddmmyy) {
        const day = parseInt(ddmmyy[1]);
        const month = parseInt(ddmmyy[2]);
        let year = parseInt(ddmmyy[3]);
        if (year < 50) year += 2000; else year += 1900;
        if (day > 0 && day <= 31 && month > 0 && month <= 12) {
            const date = new Date(year, month - 1, day);
            if (!isNaN(date.getTime()) && date.getDate() === day && date.getMonth() === month - 1) {
                return date.toISOString().split('T')[0];
            }
        }
    }
    
    // Try natural language dates (e.g., "Jan 5 2024", "5 Jan 2024", "January 5, 2024")
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                       'july', 'august', 'september', 'october', 'november', 'december'];
    const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                      'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    
    const lowerStr = dateStr.toLowerCase();
    for (let i = 0; i < monthNames.length; i++) {
        const monthPattern = new RegExp(`(\\d{1,2})[\\s,]+(${monthNames[i]}|${monthAbbr[i]})[\\s,]+(\\d{4})`, 'i');
        const match = dateStr.match(monthPattern);
        if (match) {
            const day = parseInt(match[1]);
            const year = parseInt(match[3]);
            const date = new Date(year, i, day);
            if (!isNaN(date.getTime()) && date.getDate() === day) {
                return date.toISOString().split('T')[0];
            }
        }
        
        // Reverse: "Jan 5 2024"
        const revPattern = new RegExp(`(${monthNames[i]}|${monthAbbr[i]})[\\s,]+(\\d{1,2})[\\s,]+(\\d{4})`, 'i');
        const revMatch = dateStr.match(revPattern);
        if (revMatch) {
            const day = parseInt(revMatch[2]);
            const year = parseInt(revMatch[3]);
            const date = new Date(year, i, day);
            if (!isNaN(date.getTime()) && date.getDate() === day) {
                return date.toISOString().split('T')[0];
            }
        }
    }
    
    // Try natural date parsing as last resort
    const date = new Date(dateStr);
    if (!isNaN(date.getTime()) && date.getFullYear() > 2000 && date.getFullYear() < 2100) {
        return date.toISOString().split('T')[0];
    }
    
    return null;
}

// Extract amount from text (handles various formats)
function extractAmount(text) {
    if (!text) return null;
    
    // Remove common currency symbols and words
    let cleaned = text.toString()
        .replace(/[₹$€£]/g, '')
        .replace(/rupees?/gi, '')
        .replace(/rs\.?/gi, '')
        .replace(/amount/gi, '')
        .replace(/paid/gi, '')
        .trim();
    
    // Remove commas and spaces
    cleaned = cleaned.replace(/[, ]/g, '');
    
    // Extract number (including decimals)
    const match = cleaned.match(/(\d+\.?\d*)/);
    if (match) {
        const amount = parseFloat(match[1]);
        if (!isNaN(amount) && amount > 0) {
            return amount;
        }
    }
    
    return null;
}

// Extract date from text (handles various formats)
function extractDate(text) {
    if (!text) return null;
    
    // Try to find date patterns in the text
    const datePatterns = [
        // ISO: 2024-01-05
        /\d{4}-\d{2}-\d{2}/,
        // DD/MM/YYYY or DD-MM-YYYY
        /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/,
        // DD/MM/YY
        /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2}/,
        // Natural: Jan 5 2024, 5 Jan 2024
        /\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}/i,
        /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\s+\d{4}/i,
    ];
    
    for (const pattern of datePatterns) {
        const match = text.match(pattern);
        if (match) {
            const date = parseDate(match[0]);
            if (date) return date;
        }
    }
    
    // Try parsing the whole text as date
    return parseDate(text);
}

// Parse and import payments from text (enhanced for notes/photos)
function parseAndImportPayments() {
    const importText = document.getElementById('bulkImportText').value.trim();
    const preview = document.getElementById('importPreview');
    
    if (!importText) {
        preview.innerHTML = '<div class="preview-note" style="color: #ef4444;">Please enter payment data to import.</div>';
        return;
    }
    
    const lines = importText.split('\n').filter(line => line.trim());
    const payments = [];
    const errors = [];
    const warnings = [];
    
    lines.forEach((line, index) => {
        const lineNum = index + 1;
        const trimmed = line.trim();
        
        if (!trimmed) return;
        
        // Skip lines that are clearly headers or labels
        if (/^(date|amount|payment|day|total|sum)/i.test(trimmed)) {
            return;
        }
        
        let date = null;
        let amount = null;
        
        // Method 1: Try structured format (comma/tab separated)
        if (trimmed.includes(',') || trimmed.includes('\t')) {
            const parts = trimmed.includes(',') 
                ? trimmed.split(',').map(p => p.trim())
                : trimmed.split('\t').map(p => p.trim());
            
            if (parts.length >= 2) {
                date = extractDate(parts[0]);
                amount = extractAmount(parts[1]) || extractAmount(parts[2]) || extractAmount(parts[3]);
            }
        }
        
        // Method 2: Try space-separated format
        if (!date || !amount) {
            const spaceParts = trimmed.split(/\s+/).filter(p => p);
            
            // Try to find date and amount in the parts
            for (let i = 0; i < spaceParts.length; i++) {
                const potentialDate = extractDate(spaceParts[i] + ' ' + (spaceParts[i + 1] || '') + ' ' + (spaceParts[i + 2] || ''));
                if (potentialDate && !date) {
                    date = potentialDate;
                }
                
                const potentialAmount = extractAmount(spaceParts[i]);
                if (potentialAmount && !amount) {
                    amount = potentialAmount;
                }
            }
        }
        
        // Method 3: Smart extraction from unstructured text
        if (!date || !amount) {
            // Try to find date anywhere in the line
            if (!date) {
                date = extractDate(trimmed);
            }
            
            // Try to find amount anywhere in the line
            if (!amount) {
                amount = extractAmount(trimmed);
            }
        }
        
        // Validation
        if (!date && !amount) {
            errors.push(`Line ${lineNum}: Could not find date or amount in: "${trimmed.substring(0, 50)}"`);
            return;
        }
        
        if (!date) {
            warnings.push(`Line ${lineNum}: Could not parse date, using today's date`);
            date = new Date().toISOString().split('T')[0];
        }
        
        if (!amount) {
            errors.push(`Line ${lineNum}: Could not find amount in: "${trimmed.substring(0, 50)}"`);
            return;
        }
        
        payments.push({ date, amount, lineNum, original: trimmed });
    });
    
    // Show errors if any
    if (errors.length > 0) {
        let errorHtml = '<div class="preview-section" style="border-color: #ef4444;"><h4 style="color: #ef4444;">⚠️ Import Errors:</h4><ul style="color: #ef4444; margin: 10px 0; font-size: 13px;">';
        errors.forEach(error => {
            errorHtml += `<li>${error}</li>`;
        });
        errorHtml += '</ul></div>';
        
        if (payments.length > 0) {
            errorHtml += '<p style="color: #f59e0b; margin-top: 10px;">⚠️ Some payments were parsed successfully. You can still apply them.</p>';
        }
        
        preview.innerHTML = errorHtml;
    }
    
    if (payments.length === 0) {
        if (errors.length === 0) {
            preview.innerHTML = '<div class="preview-note" style="color: #ef4444;">No valid payments found. Please check your format.</div>';
        }
        return;
    }
    
    // Show warnings if any
    if (warnings.length > 0 && errors.length === 0) {
        let warningHtml = '<div class="preview-section" style="border-color: #f59e0b;"><h4 style="color: #f59e0b;">⚠️ Warnings:</h4><ul style="color: #f59e0b; margin: 10px 0; font-size: 13px;">';
        warnings.forEach(warning => {
            warningHtml += `<li>${warning}</li>`;
        });
        warningHtml += '</ul></div>';
        preview.innerHTML = warningHtml;
    }
    
    // Show preview
    let totalAmount = 0;
    payments.forEach(p => totalAmount += p.amount);
    
    let html = errors.length === 0 ? '' : '<div style="margin-bottom: 15px;"></div>';
    html += '<div class="preview-section"><h4>✅ Import Preview:</h4>';
    html += `<p><strong>Found ${payments.length} payment(s)</strong></p>`;
    html += '<div class="preview-table-container"><table class="preview-table"><thead><tr><th>#</th><th>Date & Day</th><th>Amount</th></tr></thead><tbody>';
    
    payments.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    payments.forEach((payment, index) => {
        const dateWithDay = formatDateWithDay(payment.date);
        html += `<tr>
            <td>${index + 1}</td>
            <td><strong>${dateWithDay}</strong></td>
            <td>₹${payment.amount.toFixed(2)}</td>
        </tr>`;
    });
    
    html += '</tbody></table></div>';
    html += `<div class="preview-total"><strong>Total Payments: ${payments.length}</strong> | <strong>Total Amount: ₹${totalAmount.toFixed(2)}</strong></div>`;
    html += '<p style="margin-top: 15px;">';
    html += '<button class="btn btn-primary" onclick="applyImportedPayments()" style="margin-right: 10px;">✅ Apply Import</button>';
    html += '<button class="btn btn-success" onclick="applyImportedPaymentsAndSubmit()">✅ Apply & Submit All</button>';
    html += '</p>';
    html += '</div>';
    
    if (errors.length === 0) {
        preview.innerHTML = html;
    } else {
        preview.innerHTML = preview.innerHTML + html;
    }
    
    // Store payments for later use
    window.importedPayments = payments;
}

// Apply imported payments and automatically submit
function applyImportedPaymentsAndSubmit() {
    applyImportedPayments();
    
    // Wait a bit for rows to be added, then submit
    setTimeout(() => {
        const form = document.getElementById('flexibleBulkPaymentForm');
        if (form) {
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(submitEvent);
        }
    }, 300);
}

// Handle photo upload
function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check if it's an image
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file (JPG, PNG, etc.)');
        return;
    }
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('Image size should be less than 10MB. Please compress the image and try again.');
        return;
    }
    
    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById('photoPreview');
        const previewImage = document.getElementById('previewImage');
        previewImage.src = e.target.result;
        preview.style.display = 'block';
        document.getElementById('ocrProgress').style.display = 'none';
    };
    reader.readAsDataURL(file);
    
    // Store file for OCR processing
    window.uploadedPhotoFile = file;
}

// Process photo with OCR
async function processPhotoOCR() {
    if (!window.uploadedPhotoFile) {
        alert('Please upload a photo first.');
        return;
    }
    
    const ocrProgress = document.getElementById('ocrProgress');
    const ocrStatus = document.getElementById('ocrStatus');
    const processBtn = document.getElementById('processPhotoBtn');
    
    // Show progress
    ocrProgress.style.display = 'block';
    processBtn.disabled = true;
    processBtn.textContent = '⏳ Processing...';
    
    try {
        ocrStatus.textContent = 'Loading OCR engine...';
        
        // Check if Tesseract is available
        if (typeof Tesseract === 'undefined') {
            throw new Error('OCR engine not loaded. Please check your internet connection.');
        }
        
        ocrStatus.textContent = 'Recognizing text from image...';
        
        // Process image with Tesseract.js
        const { data: { text } } = await Tesseract.recognize(
            window.uploadedPhotoFile,
            'eng',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        ocrStatus.textContent = `Recognizing text... ${Math.round(m.progress * 100)}%`;
                    } else if (m.status === 'loading language traineddata') {
                        ocrStatus.textContent = 'Loading language data...';
                    } else if (m.status === 'initializing tesseract') {
                        ocrStatus.textContent = 'Initializing OCR engine...';
                    }
                }
            }
        );
        
        // Hide progress
        ocrProgress.style.display = 'none';
        processBtn.disabled = false;
        processBtn.textContent = '🔍 Extract Text from Photo';
        
        // Put extracted text in textarea
        const textarea = document.getElementById('bulkImportText');
        textarea.value = text;
        
        // Auto-parse the extracted text
        ocrStatus.textContent = 'Extracting payment details...';
        ocrProgress.style.display = 'block';
        
        // Parse and import
        parseAndImportPayments();
        
        ocrProgress.style.display = 'none';
        
        // Show success message
        alert(`✅ Successfully extracted text from photo!\n\nFound ${text.split('\n').filter(l => l.trim()).length} lines of text.\n\nReview the preview below and click "Apply Import" to add payments.`);
        
    } catch (error) {
        ocrProgress.style.display = 'none';
        processBtn.disabled = false;
        processBtn.textContent = '🔍 Extract Text from Photo';
        
        console.error('OCR Error:', error);
        alert('Error processing image: ' + error.message + '\n\nPlease try:\n1. Ensure the image is clear and well-lit\n2. Make sure text is readable\n3. Try a different image format (JPG, PNG)\n4. Check your internet connection');
    }
}

// Clear photo
function clearPhoto() {
    document.getElementById('photoUpload').value = '';
    document.getElementById('photoPreview').style.display = 'none';
    document.getElementById('previewImage').src = '';
    document.getElementById('ocrProgress').style.display = 'none';
    window.uploadedPhotoFile = null;
}

// Apply imported payments to payment rows
function applyImportedPayments() {
    if (!window.importedPayments || window.importedPayments.length === 0) {
        alert('No payments to import.');
        return;
    }
    
    const paymentCount = window.importedPayments.length;
    
    // Clear existing rows
    clearAllPaymentRows();
    
    // Switch to manual mode
    switchBulkMode('manual');
    
    // Add rows for each imported payment
    window.importedPayments.forEach(payment => {
        addPaymentRow();
        const rows = document.querySelectorAll('.payment-row');
        const lastRow = rows[rows.length - 1];
        
        const dateInput = lastRow.querySelector('.payment-row-date');
        const amountInput = lastRow.querySelector('.payment-row-amount');
        
        if (dateInput) dateInput.value = payment.date;
        if (amountInput) amountInput.value = payment.amount.toFixed(2);
    });
    
    // Clear import text and preview
    document.getElementById('bulkImportText').value = '';
    document.getElementById('importPreview').innerHTML = '';
    window.importedPayments = null;
    
    // Update preview
    previewFlexiblePayments();
    
    alert(`Successfully imported ${paymentCount} payment(s)!`);
}

// Add a new payment row
let paymentRowCounter = 0;
function addPaymentRow() {
    const container = document.getElementById('paymentRowsContainer');
    const rowIndex = paymentRowCounter++;
    const today = new Date().toISOString().split('T')[0];
    
    const row = document.createElement('div');
    row.className = 'payment-row';
    row.dataset.index = rowIndex;
    row.innerHTML = `
        <div class="payment-row-number">${rowIndex + 1}</div>
        <div class="payment-row-content">
            <div class="payment-row-field">
                <label>Date *</label>
                <input type="date" class="payment-row-date" data-index="${rowIndex}" required>
                <div class="quick-date-buttons-row">
                    <button type="button" class="btn-quick-date-small" onclick="setQuickDateForRow(${rowIndex}, 'today')">Today</button>
                    <button type="button" class="btn-quick-date-small" onclick="setQuickDateForRow(${rowIndex}, 'yesterday')">Yesterday</button>
                    <button type="button" class="btn-quick-date-small" onclick="setQuickDateForRow(${rowIndex}, '2days')">2 Days Ago</button>
                </div>
            </div>
            <div class="payment-row-field">
                <label>Amount (₹) *</label>
                <input type="number" class="payment-row-amount" data-index="${rowIndex}" min="0" step="0.01" placeholder="0.00" required>
            </div>
            <button type="button" class="btn-remove-row" onclick="removePaymentRow(${rowIndex})" title="Remove this payment">
                🗑️
            </button>
        </div>
    `;
    
    container.appendChild(row);
    
    // Set default date to today
    const dateInput = row.querySelector('.payment-row-date');
    if (dateInput) {
        dateInput.value = today;
    }
    
    // Add event listeners for preview update
    row.querySelector('.payment-row-date').addEventListener('change', previewFlexiblePayments);
    row.querySelector('.payment-row-amount').addEventListener('input', previewFlexiblePayments);
    
    // Update row numbers
    updatePaymentRowNumbers();
    
    // Update preview
    previewFlexiblePayments();
}

// Remove a payment row
function removePaymentRow(index) {
    const row = document.querySelector(`.payment-row[data-index="${index}"]`);
    if (row) {
        row.remove();
        updatePaymentRowNumbers();
        previewFlexiblePayments();
    }
}

// Clear all payment rows
function clearAllPaymentRows() {
    const container = document.getElementById('paymentRowsContainer');
    if (container) {
        container.innerHTML = '';
    }
    paymentRowCounter = 0;
    const flexiblePreview = document.getElementById('flexibleBulkPreview');
    if (flexiblePreview) {
        flexiblePreview.innerHTML = '';
    }
}

// Update payment row numbers
function updatePaymentRowNumbers() {
    const rows = document.querySelectorAll('.payment-row');
    rows.forEach((row, index) => {
        const numberDiv = row.querySelector('.payment-row-number');
        if (numberDiv) {
            numberDiv.textContent = index + 1;
        }
        row.dataset.index = index;
        // Update data-index in inputs
        row.querySelectorAll('.payment-row-date, .payment-row-amount').forEach(input => {
            input.dataset.index = index;
        });
        // Update onclick handlers
        const removeBtn = row.querySelector('.btn-remove-row');
        if (removeBtn) {
            removeBtn.setAttribute('onclick', `removePaymentRow(${index})`);
        }
        const quickDateBtns = row.querySelectorAll('.btn-quick-date-small');
        quickDateBtns.forEach((btn, btnIndex) => {
            const periods = ['today', 'yesterday', '2days'];
            if (periods[btnIndex]) {
                btn.setAttribute('onclick', `setQuickDateForRow(${index}, '${periods[btnIndex]}')`);
            }
        });
    });
}

// Set quick date for a specific row
function setQuickDateForRow(rowIndex, period) {
    const row = document.querySelector(`.payment-row[data-index="${rowIndex}"]`);
    if (!row) return;
    
    const dateInput = row.querySelector('.payment-row-date');
    if (!dateInput) return;
    
    const today = new Date();
    
    if (period === 'today') {
        dateInput.value = today.toISOString().split('T')[0];
    } else if (period === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        dateInput.value = yesterday.toISOString().split('T')[0];
    } else if (period === '2days') {
        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        dateInput.value = twoDaysAgo.toISOString().split('T')[0];
    }
    
    previewFlexiblePayments();
}

// Preview bulk payments (Consecutive Days)
function previewBulkPayments() {
    const startDate = document.getElementById('bulkStartDate').value;
    const days = parseInt(document.getElementById('bulkDays').value);
    const amount = parseFloat(document.getElementById('bulkAmount').value);
    const preview = document.getElementById('bulkPreview');
    
    if (startDate && days > 0 && amount > 0) {
        let html = '<div class="preview-section"><h4>Preview:</h4><ul class="preview-list">';
        const start = new Date(startDate);
        
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(start);
            currentDate.setDate(start.getDate() + i);
            const dateStr = currentDate.toISOString().split('T')[0];
            const dateWithDay = formatDateWithDay(dateStr);
            html += `<li>${dateWithDay} - ₹${amount.toFixed(2)}</li>`;
        }
        
        html += `</ul><p class="preview-total"><strong>Total: ₹${(days * amount).toFixed(2)}</strong></p></div>`;
        preview.innerHTML = html;
    } else {
        preview.innerHTML = '';
    }
}

// Preview flexible payments
function previewFlexiblePayments() {
    const container = document.getElementById('paymentRowsContainer');
    const rows = container.querySelectorAll('.payment-row');
    const preview = document.getElementById('flexibleBulkPreview');
    
    if (rows.length === 0) {
        preview.innerHTML = '';
        return;
    }
    
    const payments = [];
    let totalAmount = 0;
    let validPayments = 0;
    
    rows.forEach((row, index) => {
        const dateInput = row.querySelector('.payment-row-date');
        const amountInput = row.querySelector('.payment-row-amount');
        
        if (dateInput && amountInput) {
            const date = dateInput.value;
            const amount = parseFloat(amountInput.value);
            
            if (date && amount > 0) {
                payments.push({
                    date: date,
                    amount: amount,
                    index: index + 1
                });
                totalAmount += amount;
                validPayments++;
            }
        }
    });
    
    if (validPayments === 0) {
        preview.innerHTML = '<div class="preview-note">Enter payment details above to see preview</div>';
        return;
    }
    
    // Sort payments by date
    payments.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let html = '<div class="preview-section"><h4>📋 Payment Preview:</h4><div class="preview-table-container"><table class="preview-table"><thead><tr><th>#</th><th>Date & Day</th><th>Amount</th></tr></thead><tbody>';
    
    payments.forEach((payment, index) => {
        const dateWithDay = formatDateWithDay(payment.date);
        html += `<tr>
            <td>${index + 1}</td>
            <td><strong>${dateWithDay}</strong></td>
            <td>₹${payment.amount.toFixed(2)}</td>
        </tr>`;
    });
    
    html += `</tbody></table></div>`;
    html += `<div class="preview-total"><strong>Total Payments: ${validPayments}</strong> | <strong>Total Amount: ₹${totalAmount.toFixed(2)}</strong></div>`;
    html += '</div>';
    
    preview.innerHTML = html;
}

// Handle bulk payment form submission (Consecutive Days)
function handleBulkPaymentSubmit(e) {
    e.preventDefault();
    
    const customerId = document.getElementById('bulkPaymentCustomerId').value;
    const startDate = document.getElementById('bulkStartDate').value;
    const days = parseInt(document.getElementById('bulkDays').value);
    const amount = parseFloat(document.getElementById('bulkAmount').value);
    
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
        const start = new Date(startDate);
        
        for (let i = 0; i < days; i++) {
            const currentDate = new Date(start);
            currentDate.setDate(start.getDate() + i);
            const dateStr = currentDate.toISOString().split('T')[0];
            
            // Check if payment already exists for this date
            const existingPayment = customer.payments.find(p => p.date === dateStr);
            if (existingPayment) {
                // Update existing payment
                existingPayment.amount = amount;
            } else {
                // Add new payment
                customer.payments.push({
                    date: dateStr,
                    amount: amount
                });
            }
        }
        
        // Sort payments by date
        customer.payments.sort((a, b) => new Date(a.date) - new Date(b.date));
        saveCustomers();
        document.getElementById('bulkPaymentForm').reset();
        document.getElementById('bulkPaymentModal').style.display = 'none';
        document.getElementById('bulkPreview').innerHTML = '';
        
        alert(`Successfully added ${days} payment(s) of ₹${amount.toFixed(2)} each!`);
    }
}

// Handle flexible bulk payment form submission
function handleFlexibleBulkPaymentSubmit(e) {
    e.preventDefault();
    
    const customerId = document.getElementById('flexibleBulkPaymentCustomerId').value;
    const container = document.getElementById('paymentRowsContainer');
    const rows = container.querySelectorAll('.payment-row');
    
    const customer = customers.find(c => c.id === customerId);
    if (!customer) {
        alert('Customer not found!');
        return;
    }
    
    const paymentsToAdd = [];
    const errors = [];
    
    rows.forEach((row, index) => {
        const dateInput = row.querySelector('.payment-row-date');
        const amountInput = row.querySelector('.payment-row-amount');
        
        if (!dateInput || !amountInput) return;
        
        const date = dateInput.value;
        const amount = parseFloat(amountInput.value);
        
        if (!date) {
            errors.push(`Row ${index + 1}: Date is required`);
            return;
        }
        
        if (!amount || amount <= 0) {
            errors.push(`Row ${index + 1}: Amount must be greater than 0`);
            return;
        }
        
        paymentsToAdd.push({ date, amount });
    });
    
    if (errors.length > 0) {
        alert('Please fix the following errors:\n\n' + errors.join('\n'));
        return;
    }
    
    if (paymentsToAdd.length === 0) {
        alert('Please add at least one payment.');
        return;
    }
    
    // Process payments
    let addedCount = 0;
    let updatedCount = 0;
    
    paymentsToAdd.forEach(payment => {
        const existingPayment = customer.payments.find(p => p.date === payment.date);
        if (existingPayment) {
            existingPayment.amount = payment.amount;
            updatedCount++;
        } else {
            customer.payments.push({
                date: payment.date,
                amount: payment.amount
            });
            addedCount++;
        }
    });
    
    // Sort payments by date
    customer.payments.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveCustomers();
    
    // Reset form
    clearAllPaymentRows();
    document.getElementById('flexibleBulkPaymentModal').style.display = 'none';
    document.getElementById('flexibleBulkPreview').innerHTML = '';
    
    // Show success message
    let message = `Successfully processed ${paymentsToAdd.length} payment(s)!\n`;
    if (addedCount > 0) message += `✅ Added: ${addedCount}\n`;
    if (updatedCount > 0) message += `🔄 Updated: ${updatedCount}`;
    alert(message);
}

// Send WhatsApp message with pending amount
function sendWhatsAppMessage(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
        const totalPaid = calculateTotalPaid(customer);
        const pending = customer.loanAmount - totalPaid;
        
        if (pending <= 0) {
            alert('No pending amount for this customer.');
            return;
        }
        
        // Format phone number (remove any spaces, dashes, etc.)
        let phoneNumber = customer.phone.replace(/\D/g, '');
        
        // If phone number doesn't start with country code, assume it's Indian (+91)
        if (phoneNumber.length === 10) {
            phoneNumber = '91' + phoneNumber;
        }
        
        // Create message
        const message = `Hello ${customer.name},\n\n` +
            `This is a reminder about your pending payment.\n\n` +
            `*Payment Details:*\n` +
            `Loan Amount: ₹${customer.loanAmount.toFixed(2)}\n` +
            `Total Paid: ₹${totalPaid.toFixed(2)}\n` +
            `*Pending Amount: ₹${pending.toFixed(2)}*\n\n` +
            `Please make the payment at your earliest convenience.\n\n` +
            `Thank you!`;
        
        // Encode message for URL
        const encodedMessage = encodeURIComponent(message);
        
        // Open WhatsApp Web/App
        const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
        window.open(whatsappUrl, '_blank');
    }
}

// Send detailed payment history via WhatsApp
function sendPaymentDetails(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    const totalPaid = calculateTotalPaid(customer);
    const pending = customer.loanAmount - totalPaid;
    
    // Format phone number
    let phoneNumber = customer.phone.replace(/\D/g, '');
    if (phoneNumber.length === 10) {
        phoneNumber = '91' + phoneNumber;
    }
    
    // Build detailed message
    let message = `*📋 Payment Details - ${customer.name}*\n\n`;
    message += `*Customer Information:*\n`;
    message += `Name: ${customer.name}\n`;
    message += `Area: ${customer.area}\n`;
    message += `Phone: ${customer.phone}\n\n`;
    message += `*Loan Summary:*\n`;
    message += `Loan Amount: ₹${customer.loanAmount.toFixed(2)}\n`;
    message += `Total Paid: ₹${totalPaid.toFixed(2)}\n`;
    message += `Balance Amount: ₹${pending.toFixed(2)}\n\n`;
    
    if (customer.payments.length > 0) {
        message += `*Payment History:*\n`;
        message += `━━━━━━━━━━━━━━━━━━━━\n`;
        
        // Sort payments by date (newest first)
        const sortedPayments = [...customer.payments].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        sortedPayments.forEach((payment, index) => {
            const dateWithDay = formatDateWithDay(payment.date);
            message += `${index + 1}. ${dateWithDay}\n`;
            message += `   Amount: ₹${payment.amount.toFixed(2)}\n`;
            if (index < sortedPayments.length - 1) {
                message += `\n`;
            }
        });
        
        message += `━━━━━━━━━━━━━━━━━━━━\n`;
        message += `*Total Payments: ${customer.payments.length}*\n`;
    } else {
        message += `*Payment History:*\n`;
        message += `No payments recorded yet.\n`;
    }
    
    message += `\n*Thank you for your business!*`;
    
    // Encode message for URL
    const encodedMessage = encodeURIComponent(message);
    
    // Open WhatsApp Web/App
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
}

// Export to PDF
function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Set font
    doc.setFontSize(18);
    doc.text('Daily Finance Report', 14, 20);
    
    doc.setFontSize(12);
    const today = new Date().toLocaleDateString('en-IN');
    doc.text(`Generated on: ${today}`, 14, 30);
    
    // Customer Summary Table
    let yPos = 40;
    doc.setFontSize(14);
    doc.text('Customer Summary', 14, yPos);
    yPos += 10;
    
    const customerData = customers.map(customer => {
        const totalPaid = calculateTotalPaid(customer);
        const pending = customer.loanAmount - totalPaid;
        return [
            customer.name,
            customer.area,
            customer.phone,
            '₹' + customer.loanAmount.toFixed(2),
            '₹' + totalPaid.toFixed(2),
            '₹' + pending.toFixed(2)
        ];
    });
    
    doc.autoTable({
        startY: yPos,
        head: [['Name', 'Area', 'Phone', 'Loan Amount', 'Total Paid', 'Pending']],
        body: customerData,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [102, 126, 234] },
        margin: { top: yPos }
    });
    
    // Payment History
    yPos = doc.lastAutoTable.finalY + 20;
    
    // Check if we need a new page
    if (yPos > 250) {
        doc.addPage();
        yPos = 20;
    }
    
    doc.setFontSize(14);
    doc.text('Payment History', 14, yPos);
    yPos += 10;
    
    const paymentData = [];
    customers.forEach(customer => {
        if (customer.payments.length > 0) {
            customer.payments.forEach(payment => {
                paymentData.push([
                    customer.name,
                    formatDateWithDay(payment.date),
                    '₹' + payment.amount.toFixed(2)
                ]);
            });
        } else {
            paymentData.push([
                customer.name,
                'No payments',
                '₹0.00'
            ]);
        }
    });
    
    doc.autoTable({
        startY: yPos,
        head: [['Customer Name', 'Date', 'Amount']],
        body: paymentData,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [102, 126, 234] },
        margin: { top: yPos }
    });
    
    // Generate filename with current date
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Daily_Finance_Report_${dateStr}.pdf`;
    
    // Download PDF
    doc.save(filename);
}

// Bulk update all payments for a customer
function bulkUpdateAllPayments(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer || customer.payments.length === 0) {
        alert('No payments to update for this customer.');
        return;
    }
    
    document.getElementById('bulkUpdateCustomerId').value = customerId;
    const avgAmount = customer.payments.reduce((sum, p) => sum + p.amount, 0) / customer.payments.length;
    document.getElementById('updateAllAmount').value = avgAmount.toFixed(2);
    document.getElementById('bulkUpdateModal').style.display = 'block';
    previewBulkUpdate();
    document.getElementById('updateAllAmount').focus();
    document.getElementById('updateAllAmount').select();
}

// Preview bulk update
function previewBulkUpdate() {
    const customerId = document.getElementById('bulkUpdateCustomerId').value;
    const newAmount = parseFloat(document.getElementById('updateAllAmount').value);
    const preview = document.getElementById('updatePreview');
    
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    if (newAmount > 0 && customer.payments.length > 0) {
        const totalAmount = customer.payments.length * newAmount;
        let html = '<div class="preview-section"><h4>Update Preview:</h4>';
        html += `<p><strong>Total Payments:</strong> ${customer.payments.length}</p>`;
        html += `<p><strong>New Amount per Payment:</strong> ₹${newAmount.toFixed(2)}</p>`;
        html += `<p><strong>New Total Amount:</strong> ₹${totalAmount.toFixed(2)}</p>`;
        html += `<p class="preview-warning">⚠️ This will update all ${customer.payments.length} payment amounts to ₹${newAmount.toFixed(2)} each.</p>`;
        html += '</div>';
        preview.innerHTML = html;
    } else {
        preview.innerHTML = '';
    }
}

// Handle bulk update form submission
function handleBulkUpdateSubmit(e) {
    e.preventDefault();
    
    const customerId = document.getElementById('bulkUpdateCustomerId').value;
    const newAmount = parseFloat(document.getElementById('updateAllAmount').value);
    
    const customer = customers.find(c => c.id === customerId);
    if (customer && customer.payments.length > 0) {
        if (confirm(`Are you sure you want to update all ${customer.payments.length} payment amounts to ₹${newAmount.toFixed(2)} each?`)) {
            customer.payments.forEach(payment => {
                payment.amount = newAmount;
            });
            
            // Sort payments by date
            customer.payments.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            saveCustomers();
            document.getElementById('bulkUpdateForm').reset();
            document.getElementById('bulkUpdateModal').style.display = 'none';
            document.getElementById('updatePreview').innerHTML = '';
            
            alert(`Successfully updated all ${customer.payments.length} payment(s) to ₹${newAmount.toFixed(2)} each!`);
            renderCustomers();
        }
    }
}

// Export individual customer PDF
function exportCustomerPDF(customerId) {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const totalPaid = calculateTotalPaid(customer);
    const pending = customer.loanAmount - totalPaid;
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(102, 126, 234);
    doc.text('Payment Details Report', 14, 20);
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    const today = new Date().toLocaleDateString('en-IN');
    doc.text(`Generated on: ${today}`, 14, 30);
    
    // Customer Information
    let yPos = 45;
    doc.setFontSize(16);
    doc.setTextColor(102, 126, 234);
    doc.text('Customer Information', 14, yPos);
    yPos += 10;
    
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    const customerInfo = [
        ['Name:', customer.name],
        ['Area:', customer.area],
        ['Phone:', customer.phone],
        ['Loan Amount:', '₹' + customer.loanAmount.toFixed(2)],
        ['Total Paid:', '₹' + totalPaid.toFixed(2)],
        ['Balance Amount:', '₹' + pending.toFixed(2)]
    ];
    
    customerInfo.forEach(([label, value]) => {
        doc.setFont(undefined, 'bold');
        doc.text(label, 14, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(value, 60, yPos);
        yPos += 7;
    });
    
    // Payment History
    yPos += 10;
    doc.setFontSize(16);
    doc.setTextColor(102, 126, 234);
    doc.text('Payment History', 14, yPos);
    yPos += 10;
    
    if (customer.payments.length > 0) {
        // Sort payments by date
        const sortedPayments = [...customer.payments].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        const paymentData = sortedPayments.map(payment => {
            return [
                formatDateWithDay(payment.date),
                '₹' + payment.amount.toFixed(2)
            ];
        });
        
        doc.autoTable({
            startY: yPos,
            head: [['Date & Day', 'Amount']],
            body: paymentData,
            styles: { 
                fontSize: 10,
                cellPadding: 5
            },
            headStyles: { 
                fillColor: [102, 126, 234],
                textColor: [255, 255, 255],
                fontStyle: 'bold'
            },
            alternateRowStyles: {
                fillColor: [248, 249, 250]
            },
            margin: { top: yPos }
        });
        
        yPos = doc.lastAutoTable.finalY + 10;
        
        // Summary
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`Total Payments: ${customer.payments.length}`, 14, yPos);
        doc.setFont(undefined, 'normal');
    } else {
        doc.setFontSize(11);
        doc.text('No payments recorded yet.', 14, yPos);
    }
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
            `Page ${i} of ${pageCount} - Daily Finance Tracker`,
            doc.internal.pageSize.getWidth() / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }
    
    // Generate filename
    const customerName = customer.name.replace(/[^a-z0-9]/gi, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Payment_Details_${customerName}_${dateStr}.pdf`;
    
    // Download PDF
    doc.save(filename);
}

