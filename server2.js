const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== MONGODB CONNECTION ==========
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://emmanuelvulimo27_db_user:Lab1234567@cluster0.jbvtpfa.mongodb.net/complab?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected - Cyber & Lab System is PERMANENT!');
    ensureAdmin();
  })
  .catch(err => console.log('MongoDB Error:', err));

// ========== MODELS ==========
const userSchema = new mongoose.Schema({
  regNumber: { type: String, unique: true },
  name: String,
  email: String,
  password: String,
  role: String,
  status: { type: String, default: 'Approved' },
  balance: { type: Number, default: 0 }, // Wallet in KES
  failedAttempts: { type: Number, default: 0 }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const labSchema = new mongoose.Schema({
  labID: { type: Number, unique: true },
  labName: String,
  capacity: Number
}, { timestamps: true });
const Lab = mongoose.model('Lab', labSchema);

const equipmentSchema = new mongoose.Schema({
  equipmentID: { type: Number, unique: true },
  labID: String,
  name: String,
  serialNo: String,
  status: String,
  technicianReg: String,
  conditionSummary: String
}, { timestamps: true });
const Equipment = mongoose.model('Equipment', equipmentSchema);

const bookingSchema = new mongoose.Schema({
  bookingID: { type: Number, unique: true },
  regNumber: String,
  email: String,
  labID: String,
  purpose: String,
  bookingDate: String,
  finishTime: String,
  status: { type: String, default: 'Pending' }
}, { timestamps: true });
const Booking = mongoose.model('Booking', bookingSchema);

const transactionSchema = new mongoose.Schema({
  transactionID: { type: String, unique: true },
  regNumber: String,
  amount: Number,
  mpesaCode: String,
  type: String // 'Deposit', 'Browsing', 'Printing'
}, { timestamps: true });
const Transaction = mongoose.model('Transaction', transactionSchema);

const printJobSchema = new mongoose.Schema({
  jobID: { type: Number, unique: true },
  regNumber: String,
  documentName: String,
  pages: Number,
  printType: String,
  totalCost: Number
}, { timestamps: true });
const PrintJob = mongoose.model('PrintJob', printJobSchema);

// ========== ENSURE ADMIN ==========
async function ensureAdmin() {
  const adminExists = await User.findOne({ regNumber: 'COM/ADMIN/00' });
  if (!adminExists) {
    await User.create({
      regNumber: 'COM/ADMIN/00',
      name: 'System Administrator',
      email: 'admin@lab.com',
      password: 'admin123',
      role: 'Administrator',
      balance: 0,
      failedAttempts: 0
    });
    console.log('Default admin created: COM/ADMIN/00 / admin123');
  }
}

// ================= AUTH =================
app.post('/api/register', async (req, res) => {
  const { regNumber, name, email, password, role, passkey } = req.body;
  if (!regNumber || !name || !password || !role) {
    return res.status(400).json({ error: 'All required fields must be filled.' });
  }
  if ((role === 'Administrator' || role === 'Technician') && passkey !== 'Emmahlove@1') {
    return res.status(403).json({ error: 'Invalid staff private passkey.' });
  }
  const existingUser = await User.findOne({ regNumber });
  if (existingUser) {
    return res.status(400).json({ error: 'Username or account already exists.' });
  }
  await User.create({ regNumber, name, email, password, role, status: 'Approved', balance: 0, failedAttempts: 0 });
  res.json({ message: 'Registration successful! You can now log in.' });
});

app.post('/api/login', async (req, res) => {
  await ensureAdmin();
  const { regNumber, password } = req.body;
  const user = await User.findOne({ regNumber });
  if (!user) return res.status(400).json({ error: 'Account not found. Please register first.' });
  if (user.failedAttempts >= 3) {
    return res.status(403).json({ error: 'Account locked due to 3 failed attempts. Please contact Admin.' });
  }
  if (user.password !== password) {
    user.failedAttempts = (user.failedAttempts || 0) + 1;
    await user.save();
    return res.status(400).json({ error: 'Incorrect password.' });
  }
  user.failedAttempts = 0;
  await user.save();
  res.json({ message: 'Login successful!', user: { regNumber: user.regNumber, name: user.name, role: user.role, email: user.email, balance: user.balance } });
});

// ================= FINANCIAL & M-PESA ENDPOINTS =================
app.post('/api/wallet/deposit', async (req, res) => {
  const { regNumber, amount, mpesaCode } = req.body;
  if (!regNumber || !amount || !mpesaCode) {
    return res.status(400).json({ error: 'All deposit fields are required.' });
  }
  const user = await User.findOne({ regNumber });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.balance = (user.balance || 0) + Number(amount);
  await user.save();

  await Transaction.create({
    transactionID: 'MPESA-' + Date.now(),
    regNumber,
    amount: Number(amount),
    mpesaCode,
    type: 'Deposit'
  });

  res.json({ message: `KES ${amount} successfully credited via M-Pesa!`, newBalance: user.balance });
});

app.post('/api/print/job', async (req, res) => {
  const { regNumber, documentName, pages, printType } = req.body;
  let rate = printType === 'Color' ? 20 : (printType === 'Scanning' ? 50 : 10);
  let totalCost = Number(pages) * rate;

  const user = await User.findOne({ regNumber });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if ((user.balance || 0) < totalCost) {
    return res.status(400).json({ error: `Insufficient wallet balance. Required: KES ${totalCost}, Balance: KES ${user.balance}` });
  }

  user.balance -= totalCost;
  await user.save();

  await PrintJob.create({ jobID: Date.now(), regNumber, documentName, pages: Number(pages), printType, totalCost });
  await Transaction.create({ transactionID: 'PRINT-' + Date.now(), regNumber, amount: totalCost, mpesaCode: 'WALLET', type: 'Printing' });

  res.json({ message: `Print job successful! Charged KES ${totalCost}`, newBalance: user.balance });
});

app.get('/api/admin/revenue', async (req, res) => {
  const txs = await Transaction.find();
  let total = 0, deposits = 0, printing = 0;
  txs.forEach(t => {
    if (t.type === 'Deposit') deposits += t.amount;
    if (t.type === 'Printing') printing += t.amount;
    total += t.amount;
  });
  res.json({ totalRevenue: deposits, printingRevenue: printing, transactionCount: txs.length });
});

// ================= ADMIN & LAB MANAGEMENT =================
app.get('/api/users/count', async (req, res) => {
  const usersList = await User.find();
  let stats = { total: usersList.length, students: 0, technicians: 0, admins: 0 };
  usersList.forEach(r => {
    if (r.role === 'Student') stats.students++;
    if (r.role === 'Technician') stats.technicians++;
    if (r.role === 'Administrator') stats.admins++;
  });
  res.json(stats);
});

app.get('/api/users', async (req, res) => { res.json(await User.find()); });
app.delete('/api/users/:regNumber', async (req, res) => {
  if (req.params.regNumber === 'COM/ADMIN/00') return res.status(403).json({ error: 'Cannot delete main admin' });
  await User.deleteOne({ regNumber: req.params.regNumber });
  res.json({ message: 'User deleted' });
});

app.get('/api/labs', async (req, res) => {
  const labs = await Lab.find();
  const bookings = await Booking.find({ status: 'Approved' });
  const enriched = labs.map(l => {
    const activeCount = bookings.filter(b => String(b.labID) === String(l.labID)).length;
    return { ...l.toObject(), availablePCs: Math.max(0, (l.capacity || 0) - activeCount) };
  });
  res.json(enriched);
});

app.post('/api/labs', async (req, res) => {
  const { labName, capacity } = req.body;
  await Lab.create({ labID: Date.now(), labName, capacity: Number(capacity) });
  res.json({ message: 'Lab uploaded successfully!' });
});

app.delete('/api/labs/:labID', async (req, res) => {
  await Lab.deleteOne({ labID: Number(req.params.labID) });
  res.json({ message: 'Lab removed successfully!' });
});

app.get('/api/equipment', async (req, res) => { res.json(await Equipment.find()); });
app.delete('/api/equipment/:equipmentID', async (req, res) => {
  await Equipment.deleteOne({ equipmentID: Number(req.params.equipmentID) });
  res.json({ message: 'Report deleted.' });
});

app.get('/api/bookings', async (req, res) => {
  const { regNumber } = req.query;
  let bookings = await Booking.find();
  let labs = await Lab.find();
  let enriched = bookings.map(b => {
    const lab = labs.find(l => String(l.labID) === String(b.labID));
    return { ...b.toObject(), labName: lab ? lab.labName : 'Unknown Lab' };
  });
  if (regNumber) enriched = enriched.filter(b => b.regNumber === regNumber);
  res.json(enriched);
});

app.get('/api/bookings/all', async (req, res) => {
  let bookings = await Booking.find();
  let labs = await Lab.find();
  let enriched = bookings.map(b => {
    const lab = labs.find(l => String(l.labID) === String(b.labID));
    return { ...b.toObject(), labName: lab ? lab.labName : 'Unknown Lab' };
  });
  res.json(enriched);
});

app.post('/api/bookings', async (req, res) => {
  const { regNumber, email, labID, purpose, bookingDate, finishTime } = req.body;
  await Booking.create({ bookingID: Date.now(), regNumber, email, labID, purpose, bookingDate, finishTime, status: 'Pending' });
  res.json({ message: 'Booking request submitted successfully!' });
});

app.post('/api/bookings/approve', async (req, res) => {
  const booking = await Booking.findOne({ bookingID: Number(req.body.bookingID) });
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  booking.status = 'Approved';
  await booking.save();
  res.json({ message: 'Booking approved!' });
});

app.delete('/api/bookings/:bookingID', async (req, res) => {
  await Booking.deleteOne({ bookingID: Number(req.params.bookingID) });
  res.json({ message: 'Booking cancelled.' });
});

if (require.main === module) {
  app.listen(PORT, () => { console.log(`Server running at http://localhost:${PORT}`); });
}
module.exports = app;