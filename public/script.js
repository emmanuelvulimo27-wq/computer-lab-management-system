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
    }
}

function toggleRoleFields() {
    const roleSelect = document.getElementById('regRole');
    const passkeyGroup = document.getElementById('passkeyFieldGroup');
    const regLabel = document.getElementById('regNumberLabel');
    const regInput = document.getElementById('regNumber');

    if (!roleSelect) return;

    if (roleSelect.value === 'Administrator' || roleSelect.value === 'Technician') {
        if (passkeyGroup) passkeyGroup.style.display = 'block';
        if (regLabel) regLabel.innerText = 'Username / Staff ID';
        if (regInput) regInput.placeholder = 'e.g., AdminUser or Tech01';
    } else {
        if (passkeyGroup) passkeyGroup.style.display = 'none';
        if (regLabel) regLabel.innerText = 'Registration Number';
        if (regInput) regInput.placeholder = 'e.g., COM/B/123456/21';
    }
}

async function handleAuth(event) {
    if (event) event.preventDefault();

    const regNumber = document.getElementById('regNumber').value.trim();
    const password = document.getElementById('password').value.trim();
    const forgotSection = document.getElementById('forgotPasswordSection');
    if (forgotSection) forgotSection.style.display = 'none';

    if (!regNumber || !password) {
        alert('Please fill in all required fields.');
        return;
    }

    let endpoint = '/api/login';
    let payload = { regNumber, password };

    if (isRegistering) {
        endpoint = '/api/register';
        const role = document.getElementById('regRole').value;
        const name = document.getElementById('authName').value.trim();
        const email = document.getElementById('authEmail').value.trim();
        // FIXED: Corrected ID from 'authPasskey' to 'passkey' to match index.html
        const passkey = document.getElementById('passkey').value.trim();

        if (!name) {
            alert('Please enter your name.');
            return;
        }

        payload.role = role;
        payload.name = name;
        payload.email = email;
        payload.passkey = passkey;
    }

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
async function loadAdminData() {
    try {
        const usersRes = await fetch('/api/users/count');
        const stats = await usersRes.json();
        document.getElementById('statsText').innerHTML = `Total Users: <b>${stats.total}</b> | Students: <b>${stats.students}</b> | Techs: <b>${stats.technicians}</b> | Admins: <b>${stats.admins}</b>`;

        const labsRes = await fetch('/api/labs');
        const labs = await labsRes.json();
        let labsHtml = `<tr><th>Lab ID</th><th>Lab Name</th><th>Capacity</th><th>Action</th></tr>`;
        labs.forEach(l => {
            labsHtml += `<tr><td>${l.labID}</td><td>${l.labName}</td><td>${l.capacity}</td><td><button type="button" class="delete-btn" onclick="deleteLab(${l.labID})">Remove</button></td></tr>`;
        });
        document.getElementById('labsTable').innerHTML = labsHtml;

        const pendingRes = await fetch('/api/users/pending');
        const pending = await pendingRes.json();
        let pendingHtml = `<tr><th>Reg Number</th><th>Name</th><th>Email</th><th>Action</th></tr>`;
        if (pending.length === 0) {
            pendingHtml += `<tr><td colspan="4">No pending approvals found.</td></tr>`;
        } else {
            pending.forEach(u => {
                pendingHtml += `<tr><td>${u.regNumber}</td><td>${u.name}</td><td>${u.email}</td><td><button type="button" class="action-btn" onclick="approveUser('${u.regNumber}')">Approve</button></td></tr>`;
            });
        }
        document.getElementById('pendingTable').innerHTML = pendingHtml;

        const eqRes = await fetch('/api/equipment');
        const equipment = await eqRes.json();
        let eqHtml = `<tr><th>ID</th><th>Lab ID</th><th>Name</th><th>Serial No</th><th>Status</th><th>Action</th></tr>`;
        if (equipment.length === 0) {
            eqHtml += `<tr><td colspan="6">No equipment records found.</td></tr>`;
        } else {
            equipment.forEach(e => {
                const actionBtn = e.status === 'Faulty' 
                    ? `<button type="button" class="action-btn" onclick="resolveEquipment(${e.equipmentID})">Mark Fixed</button>`
                    : `<span style="color: green; font-weight: 600;">Operational</span>`;
                eqHtml += `<tr><td>${e.equipmentID}</td><td>${e.labID}</td><td>${e.name}</td><td>${e.serialNo}</td><td><b>${e.status}</b></td><td>${actionBtn}</td></tr>`;
            });
        }
        document.getElementById('equipmentTable').innerHTML = eqHtml;
    } catch (err) {
        console.error('Error loading admin dashboard:', err);
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
        console.error('Error adding lab:', err);
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
        console.error('Error deleting lab:', err);
        alert(err.message);
    }
}

async function approveUser(regNumber) {
    try {
        const res = await fetch('/api/users/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ regNumber })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Approval failed');
        alert(data.message);
        loadAdminData();
    } catch (err) {
        console.error('Approval error:', err);
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
        console.error('Error resolving equipment:', err);
        alert(err.message);
    }
}

// --- Technician Functions ---
async function loadTechData() {
    try {
        const labsRes = await fetch('/api/labs');
        const labs = await labsRes.json();
        
        let labsHtml = `<tr><th>Lab ID</th><th>Lab Name</th><th>Available Computer Count</th></tr>`;
        let selectOptions = '';
        if (labs.length === 0) {
            labsHtml += `<tr><td colspan="3">No labs configured yet.</td></tr>`;
            selectOptions = `<option value="">No labs available</option>`;
        } else {
            labs.forEach(l => {
                labsHtml += `<tr><td>${l.labID}</td><td>${l.labName}</td><td>${l.capacity}</td></tr>`;
                selectOptions += `<option value="${l.labID}">${l.labName} (Capacity: ${l.capacity})</option>`;
            });
        }
        document.getElementById('techLabsTable').innerHTML = labsHtml;
        document.getElementById('techLabSelect').innerHTML = selectOptions;

        const bookingsRes = await fetch('/api/bookings/all');
        if (bookingsRes.ok) {
            const bookings = await bookingsRes.json();
            let bookingsHtml = `<tr><th>Booking ID</th><th>Student Reg</th><th>Lab ID</th><th>Purpose</th><th>Start Time</th><th>Finish Time</th><th>Status</th><th>Action</th></tr>`;
            if (bookings.length === 0) {
                bookingsHtml += `<tr><td colspan="8">No lab booking requests found.</td></tr>`;
            } else {
                bookings.forEach(b => {
                    const approveAction = b.status === 'Approved' 
                        ? `<span style="color: green; font-weight: 600;">Approved</span>`
                        : `<button type="button" class="action-btn" onclick="approveBooking(${b.bookingID})">Approve</button>`;
                    bookingsHtml += `<tr><td>${b.bookingID}</td><td>${b.regNumber}</td><td>${b.labID}</td><td>${b.purpose}</td><td>${b.bookingDate}</td><td>${b.finishTime || 'N/A'}</td><td><b>${b.status || 'Pending'}</b></td><td>${approveAction}</td></tr>`;
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
        console.error('Booking approval error:', err);
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
    } catch (err) {
        console.error('Equipment upload error:', err);
        alert(err.message);
    }
}

// --- Student Functions ---
async function loadStudentData() {
    try {
        const user = JSON.parse(localStorage.getItem('currentUser'));
        const res = await fetch('/api/labs');
        const labs = await res.json();
        
        let labsHtml = `<tr><th>Lab ID</th><th>Lab Name</th><th>Capacity</th></tr>`;
        let selectOptions = '';
        
        if (labs.length === 0) {
            labsHtml += `<tr><td colspan="3">No labs available yet.</td></tr>`;
            selectOptions = `<option value="">No labs available</option>`;
        } else {
            labs.forEach(l => {
                labsHtml += `<tr><td>${l.labID}</td><td>${l.labName}</td><td>${l.capacity}</td></tr>`;
                selectOptions += `<option value="${l.labID}">${l.labName} (Capacity: ${l.capacity})</option>`;
            });
        }
        document.getElementById('studentLabsTable').innerHTML = labsHtml;
        document.getElementById('bookingLabSelect').innerHTML = selectOptions;

        if (user && user.regNumber) {
            try {
                const bookingsRes = await fetch(`/api/bookings?regNumber=${user.regNumber}`);
                if (bookingsRes.ok) {
                    const bookings = await bookingsRes.json();
                    let bookingsHtml = `<tr><th>Booking ID</th><th>Lab Name</th><th>Purpose</th><th>Start Time</th><th>Finish Time</th><th>Status</th></tr>`;
                    if (bookings.length === 0) {
                        bookingsHtml += `<tr><td colspan="6">No active bookings found.</td></tr>`;
                    } else {
                        bookings.forEach(b => {
                            bookingsHtml += `<tr><td>${b.bookingID}</td><td>${b.labName || b.labID}</td><td>${b.purpose}</td><td>${b.bookingDate}</td><td>${b.finishTime || 'N/A'}</td><td><b>${b.status || 'Pending'}</b></td></tr>`;
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

async function submitBooking() {
    const user = JSON.parse(localStorage.getItem('currentUser')) || {};
    const regInput = document.getElementById('bookingRegNumber');
    
    const regNumber = (regInput && regInput.value.trim()) ? regInput.value.trim() : (user.regNumber || '');
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
    }
    if (!bookingDate) {
        alert('Please select a start date and time.');
        return;
    }
    if (!finishTime) {
        alert('Please select a finish date and time.');
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
        if (regInput) regInput.value = '';
        document.getElementById('bookingPurpose').value = '';
        document.getElementById('bookingDate').value = '';
        document.getElementById('bookingFinishTime').value = '';
        loadStudentData();
    } catch (err) {
        console.error('Booking error:', err);
        alert(err.message);
    }
}

window.onload = function() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (user) {
        routeUser(user);
    }
};