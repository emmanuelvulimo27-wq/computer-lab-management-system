const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// FIX FOR VERCEL: Use /tmp folder on Vercel, use /data locally
const dataDir = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');
const labsFile = path.join(dataDir, 'labs.json');
const equipmentFile = path.join(dataDir, 'equipment.json');
const bookingsFile = path.join(dataDir, 'bookings.json');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

function readJSON(filePath, defaultData = []) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : defaultData;
    } catch (e) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
}

function writeJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function ensureAdmin() {
    let usersList = readJSON(usersFile);
    const adminExists = usersList.find(u => u.regNumber === 'COM/ADMIN/00');
    if (!adminExists) {
        usersList.push({
            regNumber: 'COM/ADMIN/00',
            name: 'System Administrator',
            email: 'admin@lab.com',
            password: 'admin123',
            role: 'Administrator',
            status: 'Approved',
            failedAttempts: 0
        });
        writeJSON(usersFile, usersList);
        console.log('Default admin created: COM/ADMIN/00 / admin123');
    }
    return usersList;
}

ensureAdmin();

// ================= AUTH =================
app.post('/api/register', (req, res) => {
    const { regNumber, name, email, password, role, passkey } = req.body;
    if (!regNumber || !name || !password || !role) {
        return res.status(400).json({ error: 'All required fields must be filled.' });
    }
    if ((role === 'Administrator' || role === 'Technician') && passkey !== 'staffsecret') {
        return res.status(403).json({ error: 'Invalid staff private passkey.' });
    }
    let usersList = readJSON(usersFile);
    const existingUser = usersList.find(u => u.regNumber === regNumber);
    if (existingUser) {
        return res.status(400).json({ error: 'Registration number or username already exists.' });
    }
    const initialStatus = role === 'Student' ? 'Pending' : 'Approved';
    usersList.push({ regNumber, name, email, password, role, status: initialStatus, failedAttempts: 0 });
    writeJSON(usersFile, usersList);
    const msg = initialStatus === 'Pending' ? 'Registration submitted successfully! Pending administrator approval.' : 'Staff account registered successfully!';
    res.json({ message: msg });
});

app.post('/api/login', (req, res) => {
    ensureAdmin();
    const { regNumber, password } = req.body;
    let usersList = readJSON(usersFile);
    const user = usersList.find(u => u.regNumber === regNumber);
    if (!user) return res.status(400).json({ error: 'Account not found. Please register first.' });
    if (user.failedAttempts >= 3) {
        return res.status(403).json({ error: 'Account locked due to 3 failed attempts. Please contact Admin.' });
    }
    if (user.password !== password) {
        user.failedAttempts = (user.failedAttempts || 0) + 1;
        writeJSON(usersFile, usersList);
        return res.status(400).json({ error: 'Incorrect password.' });
    }
    if (user.status !== 'Approved') {
        return res.status(403).json({ error: 'Your account is pending administrator approval.' });
    }
    user.failedAttempts = 0;
    writeJSON(usersFile, usersList);
    res.json({ message: 'Login successful!', user: { regNumber: user.regNumber, name: user.name, role: user.role, email: user.email } });
});

// ================= ADMIN & USER MANAGEMENT =================
app.get('/api/users/count', (req, res) => {
    let usersList = readJSON(usersFile);
    let stats = { total: usersList.length, students: 0, technicians: 0, admins: 0 };
    usersList.forEach(r => {
        if (r.role === 'Student') stats.students++;
        if (r.role === 'Technician') stats.technicians++;
        if (r.role === 'Administrator') stats.admins++;
    });
    res.json(stats);
});

app.get('/api/users/pending', (req, res) => {
    let usersList = readJSON(usersFile);
    const pending = usersList.filter(u => u.status === 'Pending').map(u => ({ regNumber: u.regNumber, name: u.name, email: u.email }));
    res.json(pending);
});

app.post('/api/users/approve', (req, res) => {
    const { regNumber } = req.body;
    let usersList = readJSON(usersFile);
    const user = usersList.find(u => u.regNumber === regNumber);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    user.status = 'Approved';
    writeJSON(usersFile, usersList);
    res.json({ message: 'User approved successfully!' });
});

// ===== NEW: VIEW ALL USERS - TO HELP WITH PASSWORD =====
app.get('/api/users', (req, res) => {
    let usersList = readJSON(usersFile);
    res.json(usersList);
});

// ===== NEW: RESET PASSWORD - ADMIN HELPS USER =====
app.post('/api/users/reset-password', (req, res) => {
    const { regNumber, newPassword } = req.body;
    if (!regNumber || !newPassword) {
        return res.status(400).json({ error: 'RegNumber and newPassword required' });
    }
    let usersList = readJSON(usersFile);
    const user = usersList.find(u => u.regNumber === regNumber);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    user.password = newPassword;
    user.failedAttempts = 0; // unlock account
    writeJSON(usersFile, usersList);
    res.json({ message: `Password for ${regNumber} reset to ${newPassword} successfully!` });
});

// DELETE USER
app.delete('/api/users/:regNumber', (req, res) => {
    let usersList = readJSON(usersFile);
    const reg = req.params.regNumber;
    if (reg === 'COM/ADMIN/00') return res.status(403).json({ error: 'Cannot delete main admin' });
    usersList = usersList.filter(u => u.regNumber !== reg);
    writeJSON(usersFile, usersList);
    res.json({ message: 'User deleted' });
});

// ================= LABS, EQUIPMENT, BOOKINGS (same as before) =================
app.get('/api/labs', (req, res) => { res.json(readJSON(labsFile)); });
app.post('/api/labs', (req, res) => {
    const { labName, capacity } = req.body;
    if (!labName || !capacity) return res.status(400).json({ error: 'Lab name and capacity are required.' });
    let labs = readJSON(labsFile);
    const newLab = { labID: Date.now(), labName, capacity };
    labs.push(newLab);
    writeJSON(labsFile, labs);
    res.json({ message: 'Lab uploaded successfully!', labID: newLab.labID });
});
app.delete('/api/labs/:labID', (req, res) => {
    const labID = Number(req.params.labID);
    let labs = readJSON(labsFile);
    labs = labs.filter(l => l.labID !== labID);
    writeJSON(labsFile, labs);
    res.json({ message: 'Lab removed successfully!' });
});

app.get('/api/equipment', (req, res) => { res.json(readJSON(equipmentFile)); });
app.post('/api/equipment/upload', (req, res) => {
    const { labID, name, serialNo, status, technicianReg, conditionSummary } = req.body;
    let equipment = readJSON(equipmentFile);
    const newEq = { equipmentID: Date.now(), labID, name, serialNo, status, technicianReg, conditionSummary };
    equipment.push(newEq);
    writeJSON(equipmentFile, equipment);
    res.json({ message: 'Faulty equipment record uploaded successfully!' });
});
app.post('/api/equipment/resolve', (req, res) => {
    const equipmentID = Number(req.body.equipmentID);
    let equipment = readJSON(equipmentFile);
    const eq = equipment.find(e => e.equipmentID === equipmentID);
    if (!eq) return res.status(404).json({ error: 'Equipment record not found.' });
    eq.status = 'Operational';
    writeJSON(equipmentFile, equipment);
    res.json({ message: 'Equipment marked as fixed/operational!' });
});

app.get('/api/bookings', (req, res) => {
    const { regNumber } = req.query;
    let bookings = readJSON(bookingsFile);
    let labs = readJSON(labsFile);
    let enriched = bookings.map(b => {
        const lab = labs.find(l => String(l.labID) === String(b.labID));
        return { ...b, labName: lab ? lab.labName : 'Unknown Lab' };
    });
    if (regNumber) enriched = enriched.filter(b => b.regNumber === regNumber);
    res.json(enriched);
});
app.get('/api/bookings/all', (req, res) => {
    let bookings = readJSON(bookingsFile);
    let labs = readJSON(labsFile);
    let enriched = bookings.map(b => {
        const lab = labs.find(l => String(l.labID) === String(b.labID));
        return { ...b, labName: lab ? lab.labName : 'Unknown Lab' };
    });
    res.json(enriched);
});
app.post('/api/bookings', (req, res) => {
    const { regNumber, email, labID, purpose, bookingDate, finishTime } = req.body;
    if (!regNumber) return res.status(400).json({ error: 'User registration number is missing. Please log in again.' });
    if (!labID) return res.status(400).json({ error: 'Lab ID is required.' });
    if (!purpose) return res.status(400).json({ error: 'Session purpose is required.' });
    if (!bookingDate) return res.status(400).json({ error: 'Start date and time are required.' });
    if (!finishTime) return res.status(400).json({ error: 'Finish date and time are required.' });
    let bookings = readJSON(bookingsFile);
    const newBooking = { bookingID: Date.now(), regNumber, email, labID, purpose, bookingDate, finishTime, status: 'Pending' };
    bookings.push(newBooking);
    writeJSON(bookingsFile, bookings);
    res.json({ message: 'Lab booking submitted successfully!' });
});
app.post('/api/bookings/approve', (req, res) => {
    const bookingID = Number(req.body.bookingID);
    let bookings = readJSON(bookingsFile);
    const booking = bookings.find(b => b.bookingID === bookingID);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    booking.status = 'Approved';
    writeJSON(bookingsFile, bookings);
    res.json({ message: 'Lab booking approved successfully!' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}
module.exports = app;