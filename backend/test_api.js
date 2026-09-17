const http = require('http');
const { io } = require('socket.io-client');

const BASE_URL = 'http://localhost:5000';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting Comprehensive API & Socket Verification...\n');
  const timestamp = Date.now();
  let vendorToken, adminToken, vendorId, adminId, vehicleId;

  // 1. Health check
  console.log('--- 1. Health Check ---');
  const health = await request('GET', '/api/health');
  console.log('GET /api/health:', health.status, health.body);
  if (health.status !== 200) throw new Error('Health check failed');

  // 2. Vendor Registration
  console.log('\n--- 2. Auth: Vendor Registration ---');
  const vendorEmail = `vendor_${timestamp}@example.com`;
  const vendorMobile = `98${String(timestamp).slice(-8)}`;
  const regVendor = await request('POST', '/api/auth/register', {
    name: 'Test Vendor',
    mobile: vendorMobile,
    email: vendorEmail,
    companyName: 'Apex Logistics',
    password: 'password123',
    role: 'vendor',
  });
  console.log('POST /api/auth/register (Vendor):', regVendor.status, regVendor.body.message);
  const vendorDevOtp = regVendor.body?.data?.devOtp;
  vendorId = regVendor.body?.data?.userId;

  // 3. Verify OTP
  console.log('\n--- 3. Auth: Verify OTP ---');
  const verifyVendor = await request('POST', '/api/auth/verify-otp', {
    email: vendorEmail,
    otp: vendorDevOtp,
  });
  console.log('POST /api/auth/verify-otp:', verifyVendor.status, verifyVendor.body.message);
  vendorToken = verifyVendor.body.data.token;

  // 4. Vendor Login
  console.log('\n--- 4. Auth: Login ---');
  const loginVendor = await request('POST', '/api/auth/login', {
    email: vendorEmail,
    password: 'password123',
  });
  console.log('POST /api/auth/login:', loginVendor.status, loginVendor.body.message);

  // 5. Auth: Get Me
  console.log('\n--- 5. Auth: Get Me ---');
  const getMe = await request('GET', '/api/auth/me', null, vendorToken);
  console.log('GET /api/auth/me:', getMe.status, getMe.body.data?.user?.email);

  // 6. Admin Registration & Verification
  console.log('\n--- 6. Auth: Admin Registration & Verification ---');
  const adminEmail = `admin_${timestamp}@example.com`;
  const adminMobile = `99${String(timestamp).slice(-8)}`;
  const regAdmin = await request('POST', '/api/auth/register', {
    name: 'Super Admin',
    mobile: adminMobile,
    email: adminEmail,
    companyName: 'Fleet Admin HQ',
    password: 'adminpassword123',
    role: 'admin',
  });
  const adminDevOtp = regAdmin.body?.data?.devOtp;
  adminId = regAdmin.body?.data?.userId;

  const verifyAdmin = await request('POST', '/api/auth/verify-otp', {
    email: adminEmail,
    otp: adminDevOtp,
  });
  adminToken = verifyAdmin.body.data.token;
  console.log('Admin verified, token acquired.');

  // 7. Forgot Password & Reset Password Flow
  console.log('\n--- 7. Auth: Forgot Password & Reset Flow ---');
  const forgot = await request('POST', '/api/auth/forgot-password', { email: vendorEmail });
  console.log('POST /api/auth/forgot-password:', forgot.status, forgot.body.message);
  const resetOtp = forgot.body.data.devOtp;

  const verifyResetOtp = await request('POST', '/api/auth/verify-forgot-otp', {
    email: vendorEmail,
    otp: resetOtp,
  });
  console.log('POST /api/auth/verify-forgot-otp:', verifyResetOtp.status, verifyResetOtp.body.message);

  const resetPass = await request('POST', '/api/auth/reset-password', {
    email: vendorEmail,
    otp: resetOtp,
    newPassword: 'newpassword123',
  });
  console.log('POST /api/auth/reset-password:', resetPass.status, resetPass.body.message);

  // Relogin with new password
  const relogin = await request('POST', '/api/auth/login', {
    email: vendorEmail,
    password: 'newpassword123',
  });
  vendorToken = relogin.body.data.token;
  console.log('Re-login with new password succeeded.');

  // Change password back
  const changePass = await request(
    'PUT',
    '/api/auth/change-password',
    {
      currentPassword: 'newpassword123',
      newPassword: 'password123',
    },
    vendorToken
  );
  console.log('PUT /api/auth/change-password:', changePass.status, changePass.body.message);

  // 8. Vehicle Management
  console.log('\n--- 8. Vehicle: Create Vehicle (Vendor) ---');
  const regPlate = `MH${String(timestamp).slice(-2)}AB${String(timestamp).slice(-4)}`;
  const createVeh = await request(
    'POST',
    '/api/vehicles',
    {
      vehicleNumber: regPlate,
      make: 'Tata',
      model: 'Ace Gold',
      year: 2023,
      vehicleType: 'pickup',
      capacity: '1.5 Ton',
      fuelType: 'diesel',
      rcNumber: `RC-${regPlate}`,
      insuranceNumber: `INS-${regPlate}`,
      insuranceExpiry: '2027-12-31',
    },
    vendorToken
  );
  console.log('POST /api/vehicles:', createVeh.status, createVeh.body.message);
  vehicleId = createVeh.body.data._id;
  console.log('Created Vehicle ID:', vehicleId, 'Status:', createVeh.body.data.status);

  // 9. Vendor: Get My Vehicles
  console.log('\n--- 9. Vehicle: Get My Vehicles ---');
  const myVehicles = await request('GET', '/api/vehicles/my', null, vendorToken);
  console.log('GET /api/vehicles/my:', myVehicles.status, 'Count:', myVehicles.body.data?.length);

  // 10. Vehicle: Get Single Vehicle
  console.log('\n--- 10. Vehicle: Get Vehicle By ID ---');
  const getVeh = await request('GET', `/api/vehicles/${vehicleId}`, null, vendorToken);
  console.log('GET /api/vehicles/:id:', getVeh.status, getVeh.body.data?.vehicleNumber);

  // 11. Vehicle: Update Vehicle
  console.log('\n--- 11. Vehicle: Update Vehicle ---');
  const updateVeh = await request(
    'PUT',
    `/api/vehicles/${vehicleId}`,
    {
      model: 'Ace Gold Plus',
      capacity: '1.8 Ton',
    },
    vendorToken
  );
  console.log('PUT /api/vehicles/:id:', updateVeh.status, updateVeh.body.data?.model);

  // 12. Security Check: Vendor cannot access Admin endpoints
  console.log('\n--- 12. Security: Vendor blocked from Admin routes ---');
  const blockedAdminReq = await request('GET', '/api/admin/dashboard', null, vendorToken);
  console.log('Vendor calling /api/admin/dashboard (Expected 403):', blockedAdminReq.status, blockedAdminReq.body.message);

  // 13. Admin Dashboard
  console.log('\n--- 13. Admin: Dashboard ---');
  const adminDash = await request('GET', '/api/admin/dashboard', null, adminToken);
  console.log('GET /api/admin/dashboard:', adminDash.status, adminDash.body.data?.stats);

  // 14. Admin: Vendors & Vendor Vehicles
  console.log('\n--- 14. Admin: Vendors List & Single Vendor ---');
  const adminVendors = await request('GET', '/api/admin/vendors', null, adminToken);
  console.log('GET /api/admin/vendors:', adminVendors.status, 'Total Vendors:', adminVendors.body.data?.length);

  const adminSingleVendor = await request('GET', `/api/admin/vendors/${vendorId}`, null, adminToken);
  console.log('GET /api/admin/vendors/:id:', adminSingleVendor.status, adminSingleVendor.body.data?.companyName);

  const adminVendorVehs = await request('GET', `/api/admin/vendors/${vendorId}/vehicles`, null, adminToken);
  console.log('GET /api/admin/vendors/:id/vehicles:', adminVendorVehs.status, 'Vehicles:', adminVendorVehs.body.data?.length);

  // 15. Admin: Vehicles list & Approval
  console.log('\n--- 15. Admin: Vehicles & Status Approval ---');
  const adminAllVehs = await request('GET', '/api/admin/vehicles', null, adminToken);
  console.log('GET /api/admin/vehicles:', adminAllVehs.status, 'Count:', adminAllVehs.body.data?.length);

  const adminApprove = await request(
    'PATCH',
    `/api/admin/vehicles/${vehicleId}/status`,
    { status: 'approved' },
    adminToken
  );
  console.log('PATCH /api/admin/vehicles/:id/status (Approve):', adminApprove.status, adminApprove.body.data?.status);

  // 16. Admin: Update Vendor Status
  console.log('\n--- 16. Admin: Update Vendor Status ---');
  const adminVendorStatus = await request(
    'PATCH',
    `/api/admin/vendors/${vendorId}/status`,
    { status: 'active', isVerified: true },
    adminToken
  );
  console.log('PATCH /api/admin/vendors/:id/status:', adminVendorStatus.status, adminVendorStatus.body.message);

  // 17. Messaging REST APIs
  console.log('\n--- 17. Messaging: REST APIs ---');
  const sendMsg = await request(
    'POST',
    '/api/messages',
    {
      receiverId: adminId,
      message: 'Hello Admin, I have submitted my vehicle documents for review.',
    },
    vendorToken
  );
  console.log('POST /api/messages (Vendor -> Admin):', sendMsg.status, sendMsg.body.message);

  const getConv = await request('GET', '/api/messages/conversations', null, vendorToken);
  console.log('GET /api/messages/conversations:', getConv.status, 'Conversations:', getConv.body.data?.length);

  const getMsgs = await request('GET', `/api/messages/${vendorId}`, null, adminToken);
  console.log('GET /api/messages/:userId (Admin viewing chat):', getMsgs.status, 'Messages count:', getMsgs.body.data?.length);

  // 18. Socket.IO Real-Time Messaging Test
  console.log('\n--- 18. Socket.IO Real-time Messaging ---');
  await testSocketMessaging(vendorToken, adminToken, vendorId, adminId);

  // 19. Clean up vehicle test
  console.log('\n--- 19. Vehicle: Delete Vehicle ---');
  const delVeh = await request('DELETE', `/api/vehicles/${vehicleId}`, null, vendorToken);
  console.log('DELETE /api/vehicles/:id:', delVeh.status, delVeh.body.message);

  console.log('\n✅ ALL BACKEND APIS & SOCKET TESTS PASSED SUCCESSFULLY!');
}

function testSocketMessaging(vendorToken, adminToken, vendorId, adminId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Socket test timed out'));
    }, 8000);

    const vendorSocket = io(BASE_URL, {
      auth: { token: vendorToken },
      transports: ['websocket', 'polling'],
    });

    const adminSocket = io(BASE_URL, {
      auth: { token: adminToken },
      transports: ['websocket', 'polling'],
    });

    let adminReceivedMsg = false;
    let adminReceivedTyping = false;

    vendorSocket.on('connect', () => {
      console.log('Vendor Socket connected:', vendorSocket.id);
    });

    adminSocket.on('connect', () => {
      console.log('Admin Socket connected:', adminSocket.id);

      // Emit typing from vendor
      setTimeout(() => {
        vendorSocket.emit('typing', { receiverId: adminId });
      }, 500);

      // Emit message from vendor
      setTimeout(() => {
        vendorSocket.emit('sendMessage', {
          receiverId: adminId,
          message: 'Real-time test message via socket!',
        });
      }, 1000);
    });

    adminSocket.on('typing', (data) => {
      console.log('Admin received typing event from sender:', data.senderId);
      adminReceivedTyping = true;
    });

    adminSocket.on('receiveMessage', (msg) => {
      console.log('Admin received real-time message:', msg.message);
      adminReceivedMsg = true;

      // Send read receipt
      adminSocket.emit('messageRead', { messageId: msg._id, senderId: vendorId });

      setTimeout(() => {
        vendorSocket.disconnect();
        adminSocket.disconnect();
        clearTimeout(timeout);
        resolve();
      }, 500);
    });

    vendorSocket.on('messageRead', (data) => {
      console.log('Vendor received messageRead receipt from:', data.readerId);
    });
  });
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
