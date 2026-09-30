let isRegistering = false;

function toggleAuthMode() {
    isRegistering = !isRegistering;
    const roleGroup = document.getElementById('roleFieldGroup');
    const nameGroup = document.getElementById('nameFieldGroup');
    const emailGroup = document.getElementById('emailFieldGroup');
    const authTitle = document.getElementById('authTitle');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const toggleText = document.getElementById('authToggleText');
    const regLabel = document.getElementById('regNumberLabel');
    const regInput = document.getElementById('regNumber');

    if (isRegistering) {
        if (roleGroup) roleGroup.style.display = 'block';
        if (nameGroup) nameGroup.style.display = 'block';
        if (emailGroup) emailGroup.style.display = 'block';
        if (authTitle) authTitle.innerText = 'Register New Account';
        if (authSubmitBtn) authSubmitBtn.innerText = 'Register Account';
        if (toggleText) toggleText.innerText = 'Already have an account? Login here';
        toggleRoleFields();
    } else {
        if (roleGroup) roleGroup.style.display = 'none';
        if (nameGroup) nameGroup.style.display = 'none';
        if (emailGroup) emailGroup.style.display = 'none';
        const passkeyGroup = document.getElementById('passkeyFieldGroup');
        if (passkeyGroup) passkeyGroup.style.display = 'none';
        
        if (authTitle) authTitle.innerText = 'System Login';
        if (authSubmitBtn) authSubmitBtn.innerText = 'Login';
        if (toggleText) toggleText.innerText = "Don't have an account? Register here";
        if (regLabel) regLabel.innerText = 'Registration Number / Username';
        if (regInput) regInput.placeholder = 'e.g., COM/B/123456/21';
    }
}

function toggleRoleFields() {
    const roleSelect = document.getElementById('regRole');
    const passkeyGroup = document.getElementById('passkeyFieldGroup');
    const regLabel = document.getElementById('regNumberLabel');
    const regInput = document.getElementById('regNumber');

    if (!roleSelect) return;

    if (roleSelect.value === 'Administrator') {
        if (passkeyGroup) passkeyGroup.style.display = 'block';
        if (regLabel) regLabel.innerText = 'Admin Username (Format: ***/ADMIN/****)';
        if (regInput) regInput.placeholder = 'e.g., SYS/ADMIN/0001';
    } else if (roleSelect.value === 'Technician') {
        if (passkeyGroup) passkeyGroup.style.display = 'block';
        if (regLabel) regLabel.innerText = 'Technician ID (Format: ***/TECH/****)';
        if (regInput) regInput.placeholder = 'e.g., LAB/TECH/0001';
    } else {
        if (passkeyGroup) passkeyGroup.style.display = 'none';
        if (regLabel) regLabel.innerText = 'Student Registration Number (Format: ***/*/01-00000/_____)';
        if (regInput) regInput.placeholder = 'e.g., ENG/S/01-12345/12345';
    }
}

async function handleAuth(event) {
    if (event) event.preventDefault();

    const regNumber = document.getElementById('regNumber').value.trim();
    const password = document.getElementById('password').value.trim();
    const forgotSection = document.getElementById('forgotPasswordSection');
    const loginLoader = document.getElementById('loginLoader');
    const authSubmitBtn = document.getElementById('authSubmitBtn');

    if (forgotSection) forgotSection.style.display = 'none';

    if (!regNumber || !password) {
        alert('Please fill in all required fields.');
        return;
    }

    let endpoint = '/api/login';
    let payload = { regNumber, password };

    if (isRegistering) {
        const role = document.getElementById('regRole').value;
        const name = document.getElementById('authName').value.trim();
        const email = document.getElementById('authEmail').value.trim();
        const passkey = document.getElementById('passkey').value.trim();

        if (!name) {
            alert('Please enter your name.');
            return;
        }

        if (role === 'Student') {
            const studentRegex = /^.{3}\/.{1}\/01-\d{5}\/.{5}$/;
            if (!studentRegex.test(regNumber)) {
                alert('Invalid Student Registration format!\nRequired format: ***/*/01-00000/*****');
                return;
            }
        } else if (role === 'Technician') {
            const techRegex = /^.{3}\/TECH\/.{4}$/;
            if (!techRegex.test(regNumber)) {
                alert('Invalid Technician ID format!\nRequired format: ***/TECH/****');
                return;
            }
        } else if (role === 'Administrator') {
            const adminRegex = /^.{3}\/ADMIN\/.{4}$/;
            if (!adminRegex.test(regNumber)) {
                alert('Invalid Admin Username format!\nRequired format: ***/ADMIN/****');
                return;
            }
        }

        endpoint = '/api/register';
        payload.role = role;
        payload.name = name;
        payload.email = email;
        payload.passkey = passkey;
    }

    if (loginLoader) loginLoader.style.display = 'block';
    if (authSubmitBtn) authSubmitBtn.disabled = true;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            if (data.error && (data.error.includes('locked') || data.error.includes('3 failed'))) {
                if (forgotSection) forgotSection.style.display = 'block';
            }
            throw new Error(data.error || 'Authentication failed');
        }

        alert(data.message);

        if (isRegistering) {
            toggleAuthMode();
        } else {
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            routeUser(data.user);
        }

    } catch (err) {
        console.error('Auth error:', err);
        alert(err.message);
    } finally {
        if (loginLoader) loginLoader.style.display = 'none';
        if (authSubmitBtn) authSubmitBtn.disabled = false;
    }
}

function routeUser(user) {
    document.getElementById('authView').classList.add('hidden');
    document.getElementById('adminDashboard').classList.add('hidden');
    document.getElementById('technicianDashboard').classList.add('hidden');
    document.getElementById('studentDashboard').classList.add('hidden');

    if (user.role === 'Administrator') {
        document.getElementById('adminDashboard').classList.remove('hidden');
        loadAdminData();
    } else if (user.role === 'Technician') {
        document.getElementById('technicianDashboard').classList.remove('hidden');
        loadTechData();
    } else {
        document.getElementById('studentDashboard').classList.remove('hidden');
        loadStudentData();
    }
}

function logout() {
    localStorage.removeItem('currentUser');
    document.getElementById('adminDashboard').classList.add('hidden');
    document.getElementById('technicianDashboard').classList.add('hidden');
    document.getElementById('studentDashboard').classList.add('hidden');
    document.getElementById('authView').classList.remove('hidden');
}

// --- Admin Functions ---
let globalUsersCache = [];
let globalLabsCache = [];

async function loadAdminData() {
    try {
        const usersRes = await fetch('/api/users/count');
        const stats = await usersRes.json();
        document.getElementById('statsText').innerHTML = `
            <div style="display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 10px;">
                <div style="background: #f8f9fa; padding: 10px 15px; border-radius: 6px; border-left: 4px solid #3498db;">Total Users: <b>${stats.total}</b></div>
                <div style="background: #f8f9fa; padding: 10px 15px; border-radius: 6px; border-left: 4px solid #2ecc71;">Students: <b>${stats.students}</b></div>
                <div style="background: #f8f9fa; padding: 10px 15px; border-radius: 6px; border-left: 4px solid #f1c40f;">Techs: <b>${stats.technicians}</b></div>
                <div style="background: #f8f9fa; padding: 10px 15px; border-radius: 6px; border-left: 4px solid #e74c3c;">Admins: <b>${stats.admins}</b></div>
            </div>`;

        const labsRes = await fetch('/api/labs');
        globalLabsCache = await labsRes.json();
        let labsHtml = `<tr><th>Lab Name</th><th>Total Capacity</th><th>Available PCs</th><th>Action</th></tr>`;
        globalLabsCache.forEach(l => {
            labsHtml += `<tr><td><b>${l.labName}</b></td><td>${l.capacity} PCs</td><td><span style="color:#27ae60; font-weight:bold;">${l.availablePCs} Free</span></td><td><button type="button" class="delete-btn" onclick="deleteLab(${l.labID})">Remove Lab</button></td></tr>`;
        });
        document.getElementById('labsTable').innerHTML = labsHtml;

        const allUsersRes = await fetch('/api/users');
        if (allUsersRes.ok) {
            globalUsersCache = await allUsersRes.json();
            renderUserManagementTable(globalUsersCache);
        }

        const eqRes = await fetch('/api/equipment');
        const equipment = await eqRes.json();
        let eqHtml = `<tr><th>Lab Name</th><th>Item Name</th><th>Serial No</th><th>Status</th><th>Action</th></tr>`;
        if (equipment.length === 0) {
            eqHtml += `<tr><td colspan="5">No equipment records found.</td></tr>`;
        } else {
            equipment.forEach(e => {
                const labObj = globalLabsCache.find(l => String(l.labID) === String(e.labID));
                const labDisplayName = labObj ? labObj.labName : 'Computer Lab';
                const badgeColor = e.status === 'Faulty' ? '#e74c3c' : '#27ae60';
                
                const actionBtns = `
                    ${e.status === 'Faulty' ? `<button type="button" class="action-btn" onclick="resolveEquipment(${e.equipmentID})" style="margin-right:5px;">Mark Fixed</button>` : ''}
                    <button type="button" class="delete-btn" onclick="adminDeleteEquipment(${e.equipmentID})">Delete Report</button>
                `;
                eqHtml += `<tr><td><b>${labDisplayName}</b></td><td>${e.name}</td><td>${e.serialNo}</td><td><span style="background:${badgeColor}; color:#fff; padding:3px 8px; border-radius:4px; font-size:12px;">${e.status}</span></td><td>${actionBtns}</td></tr>`;
            });
        }
        document.getElementById('equipmentTable').innerHTML = eqHtml;
    } catch (err) {
        console.error('Error loading admin dashboard:', err);
    }
}

function renderUserManagementTable(users) {
    let container = document.getElementById('userManagementTable');
    if (!container) return;

    let html = `<tr><th>Reg Number / ID</th><th>Name</th><th>Role</th><th>Password</th><th>Actions</th></tr>`;
    if (users.length === 0) {
        html += `<tr><td colspan="5">No users found.</td></tr>`;
    } else {
        users.forEach(u => {
            html += `<tr>
                <td><b>${u.regNumber}</b></td>
                <td>${u.name}</td>
                <td>${u.role}</td>
                <td><code style="background:#eee; padding:2px 6px; border-radius:4px; color:#d63031;">${u.password || 'N/A'}</code></td>
                <td>
                    <button type="button" class="action-btn" style="background:#e67e22; margin-right:5px;" onclick="promptPasswordReset('${u.regNumber}')">Reset Pass</button>
                    <button type="button" class="delete-btn" onclick="adminDeleteUser('${u.regNumber}')">Delete User</button>
                </td>
            </tr>`;
        });
    }
    container.innerHTML = html;
}

function filterUsersTable() {
    const searchInput = document.getElementById('userSearchInput');
    if (!searchInput) return;
    const query = searchInput.value.toLowerCase();
    const filtered = globalUsersCache.filter(u => 
        u.regNumber.toLowerCase().includes(query) || u.name.toLowerCase().includes(query)
    );
    renderUserManagementTable(filtered);
}

// Client-side CSV Export Utility
function exportTableToCSV(tableID, filename) {
    const table = document.getElementById(tableID);
    if (!table) return;
    let csv = [];
    const rows = table.querySelectorAll('tr');
    
    for (let i = 0; i < rows.length; i++) {
        let row = [], cols = rows[i].querySelectorAll('td, th');
        for (let j = 0; j < cols.length - 1; j++) { // Skip last action column if desired
            let data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, '').replace(/(\s\s)/gm, ' ');
            row.push('"' + data + '"');
        }
        csv.push(row.join(','));
    }
    
    const csvFile = new Blob([csv.join('\n')], { type: 'text/csv' });
    const downloadLink = document.createElement('a');
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

async function promptPasswordReset(regNumber) {
    const newPassword = prompt(`Enter a new temporary password for user (${regNumber}):`);
    if (!newPassword) return;

    try {
        const res = await fetch('/api/users/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ regNumber, newPassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Password reset failed');
        alert(data.message);
        loadAdminData();
    } catch (err) {
        alert(err.message);
    }
}

async function adminDeleteUser(regNumber) {
    if (regNumber === 'COM/ADMIN/00') {
        alert('Cannot delete the primary system administrator account.');
        return;
    }
    if (!confirm(`Are you sure you want to delete user account: ${regNumber}?`)) return;

    try {
        const res = await fetch(`/api/users/${encodeURIComponent(regNumber)}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete user');
        alert(data.message);
        loadAdminData();
    } catch (err) {
        alert(err.message);
    }
}

async function adminDeleteEquipment(equipmentID) {
    if (!confirm('Are you sure you want to delete this equipment maintenance report?')) return;
    try {
        const res = await fetch(`/api/equipment/${equipmentID}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete report');
        alert(data.message);
        loadAdminData();
    } catch (err) {
        alert(err.message);
    }
}

async function addNewLab() {
    const labNameField = document.getElementById('newLabName');
    const capacityField = document.getElementById('newLabCapacity');
    
    if (!labNameField || !capacityField) return;
    const labName = labNameField.value.trim();
    const capacity = capacityField.value.trim();

    if (!labName || !capacity) {
        alert('Please enter both lab name and capacity.');
        return;
    }

    try {
        const res = await fetch('/api/labs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labName, capacity: Number(capacity) })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to upload lab');

        alert(data.message || 'Lab uploaded successfully!');
        labNameField.value = '';
        capacityField.value = '';
        loadAdminData();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteLab(labID) {
    if (!confirm('Are you sure you want to delete this lab?')) return;
    try {
        const res = await fetch(`/api/labs/${labID}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete lab');
        alert(data.message);
        loadAdminData();
    } catch (err) {
        alert(err.message);
    }
}

async function resolveEquipment(equipmentID) {
    try {
        const res = await fetch('/api/equipment/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ equipmentID })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to resolve equipment');
        alert(data.message);
        loadAdminData();
    } catch (err) {
        alert(err.message);
    }
}

// --- Technician Functions ---
async function loadTechData() {
    try {
        const labsRes = await fetch('/api/labs');
        const labs = await labsRes.json();
        
        let labsHtml = `<tr><th>Lab Name</th><th>Total Capacity</th><th>Available PCs</th></tr>`;
        let selectOptions = '';
        if (labs.length === 0) {
            labsHtml += `<tr><td colspan="3">No labs configured yet.</td></tr>`;
            selectOptions = `<option value="">No labs available</option>`;
        } else {
            labs.forEach(l => {
                labsHtml += `<tr><td><b>${l.labName}</b></td><td>${l.capacity} PCs</td><td><span style="color:#27ae60; font-weight:bold;">${l.availablePCs} Free</span></td></tr>`;
                selectOptions += `<option value="${l.labID}">${l.labName} (Capacity: ${l.capacity}, Available: ${l.availablePCs})</option>`;
            });
        }
        document.getElementById('techLabsTable').innerHTML = labsHtml;
        document.getElementById('techLabSelect').innerHTML = selectOptions;

        const bookingsRes = await fetch('/api/bookings/all');
        if (bookingsRes.ok) {
            const bookings = await bookingsRes.json();
            let bookingsHtml = `<tr><th>Student Reg</th><th>Lab Name</th><th>Purpose</th><th>Start Time</th><th>Finish Time</th><th>Status</th><th>Actions</th></tr>`;
            
            if (bookings.length === 0) {
                bookingsHtml += `<tr><td colspan="7" style="text-align:center; padding:20px; color:#777;">No lab booking applications found.</td></tr>`;
            } else {
                bookings.forEach(b => {
                    const statusColor = b.status === 'Approved' ? '#27ae60' : '#f39c12';
                    const approveAction = b.status === 'Approved' 
                        ? `<span style="color: ${statusColor}; font-weight: 600;">Approved</span>`
                        : `<button type="button" class="action-btn" onclick="approveBooking(${b.bookingID})" style="background:#27ae60; margin-right:5px;">Approve</button>`;
                    
                    bookingsHtml += `<tr>
                        <td style="font-weight:600;">${b.regNumber}</td>
                        <td><b>${b.labName || 'Computer Lab'}</b></td>
                        <td>${b.purpose}</td>
                        <td>${b.bookingDate}</td>
                        <td>${b.finishTime || 'N/A'}</td>
                        <td><span style="background:${statusColor}; color:#fff; padding:4px 10px; border-radius:4px; font-size:11px;">${b.status || 'Pending'}</span></td>
                        <td>
                            ${approveAction}
                            <button type="button" class="delete-btn" onclick="cancelBooking(${b.bookingID})">Delete / Reject</button>
                        </td>
                    </tr>`;
                });
            }
            document.getElementById('techBookingsTable').innerHTML = bookingsHtml;
        }
    } catch (err) {
        console.error('Error loading tech data:', err);
    }
}

async function approveBooking(bookingID) {
    try {
        const res = await fetch('/api/bookings/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingID })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to approve booking');
        alert(data.message || 'Lab booking approved successfully!');
        loadTechData();
    } catch (err) {
        alert(err.message);
    }
}

async function submitFaultyEquipment() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    const labID = document.getElementById('techLabSelect').value;
    const name = document.getElementById('eqName').value.trim();
    const serialNo = document.getElementById('eqSerial').value.trim();
    const conditionSummary = document.getElementById('techCondition').value.trim();

    if (!labID || !name || !serialNo || !conditionSummary) {
        alert('Please fill in all faulty equipment fields.');
        return;
    }

    try {
        const res = await fetch('/api/equipment/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labID, name, serialNo, status: 'Faulty', technicianReg: user.regNumber, conditionSummary })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to upload equipment record');

        alert(data.message || 'Faulty equipment record uploaded successfully!');
        document.getElementById('eqName').value = '';
        document.getElementById('eqSerial').value = '';
        document.getElementById('techCondition').value = '';
        loadTechData();
    } catch (err) {
        alert(err.message);
    }
}

// --- Student Functions ---
async function loadStudentData() {
    try {
        const user = JSON.parse(localStorage.getItem('currentUser'));
        const res = await fetch('/api/labs');
        const labs = await res.json();
        
        let labsHtml = `<tr><th>Lab Name</th><th>Total Capacity</th><th>Available PCs</th></tr>`;
        let selectOptions = '';
        
        if (labs.length === 0) {
            labsHtml += `<tr><td colspan="3">No labs available yet.</td></tr>`;
            selectOptions = `<option value="">No labs available</option>`;
        } else {
            labs.forEach(l => {
                labsHtml += `<tr><td><b>${l.labName}</b></td><td>${l.capacity} PCs</td><td><span style="color:#27ae60; font-weight:bold;">${l.availablePCs} Free</span></td></tr>`;
                selectOptions += `<option value="${l.labID}">${l.labName} (Available PCs: ${l.availablePCs})</option>`;
            });
        }
        document.getElementById('studentLabsTable').innerHTML = labsHtml;
        document.getElementById('bookingLabSelect').innerHTML = selectOptions;

        if (user && user.regNumber) {
            try {
                const bookingsRes = await fetch(`/api/bookings?regNumber=${user.regNumber}`);
                if (bookingsRes.ok) {
                    const bookings = await bookingsRes.json();
                    let bookingsHtml = `<tr><th>Lab Name</th><th>Purpose</th><th>Start Time</th><th>Finish Time</th><th>Status</th><th>Action</th></tr>`;
                    if (bookings.length === 0) {
                        bookingsHtml += `<tr><td colspan="6">No active bookings found.</td></tr>`;
                    } else {
                        bookings.forEach(b => {
                            const statusColor = b.status === 'Approved' ? '#27ae60' : '#f39c12';
                            const cancelBtn = `<button type="button" class="delete-btn" onclick="cancelBooking(${b.bookingID})">Cancel</button>`;
                            bookingsHtml += `<tr>
                                <td><b>${b.labName || 'Computer Lab'}</b></td>
                                <td>${b.purpose}</td>
                                <td>${b.bookingDate}</td>
                                <td>${b.finishTime || 'N/A'}</td>
                                <td><span style="background:${statusColor}; color:#fff; padding:3px 8px; border-radius:4px; font-size:12px;">${b.status || 'Pending'}</span></td>
                                <td>${cancelBtn}</td>
                            </tr>`;
                        });
                    }
                    document.getElementById('studentBookingsTable').innerHTML = bookingsHtml;
                }
            } catch (e) {
                document.getElementById('studentBookingsTable').innerHTML = `<tr><td colspan="6">Booking history will appear here once connected.</td></tr>`;
            }
        }
    } catch (err) {
        console.error('Error loading student dashboard data:', err);
    }
}

async function cancelBooking(bookingID) {
    if (!confirm('Are you sure you want to cancel/delete this booking?')) return;
    try {
        const res = await fetch(`/api/bookings/${bookingID}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to cancel booking');
        
        alert(data.message || 'Booking cancelled successfully.');
        loadStudentData();
        const techBookingsTable = document.getElementById('techBookingsTable');
        if (techBookingsTable) loadTechData();
    } catch (err) {
        alert(err.message);
    }
}

async function submitBooking() {
    const user = JSON.parse(localStorage.getItem('currentUser')) || {};
    const regNumber = user.regNumber || '';
    const labID = document.getElementById('bookingLabSelect').value;
    const purpose = document.getElementById('bookingPurpose').value.trim();
    const bookingDate = document.getElementById('bookingDate').value;
    const finishTime = document.getElementById('bookingFinishTime').value;

    if (!regNumber) {
        alert('Registration number is missing. Please log in again.');
        return;
    }
    if (!labID) {
        alert('Please select a computer lab.');
        return;
    }
    if (!purpose) {
        alert('Please enter a session purpose or unit code.');
        return;
    }
    if (!bookingDate || !finishTime) {
        alert('Please specify both start and finish dates and times.');
        return;
    }

    // Frontend Date & Time Validation
    const now = new Date();
    const startDate = new Date(bookingDate);
    const finishDate = new Date(finishTime);

    if (startDate < now) {
        alert('You cannot book a lab session in the past.');
        return;
    }
    if (finishDate <= startDate) {
        alert('Finish time must be strictly after the start time.');
        return;
    }

    try {
        const res = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                regNumber, 
                email: user.email || '', 
                labID, 
                purpose, 
                bookingDate, 
                finishTime 
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to submit booking');
        
        alert(data.message || 'Lab booking submitted successfully!');
        document.getElementById('bookingPurpose').value = '';
        document.getElementById('bookingDate').value = '';
        document.getElementById('bookingFinishTime').value = '';
        loadStudentData();
    } catch (err) {
        alert(err.message);
    }
}

window.onload = function() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (user) {
        routeUser(user);
    }
};