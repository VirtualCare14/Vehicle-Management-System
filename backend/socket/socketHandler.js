const { verifyToken } = require('../utils/jwt');
const Message = require('../models/Message');
const User = require('../models/User');

/**
 * Register all Socket.IO event handlers for a connected socket
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
const registerSocketHandlers = (io, socket) => {
  // Extract token from auth or headers or handshake query
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
    socket.handshake.query?.token;

  if (token) {
    try {
      const sanitizedToken = String(token).trim().replace(/^["']|["']$/g, '');
      const decoded = verifyToken(sanitizedToken);
      socket.userId = decoded.id;
      // Automatically join the user's personal room
      socket.join(`user_${socket.userId}`);
      console.log(`Socket ${socket.id} authenticated for user ${socket.userId}`);
    } catch (err) {
      console.warn(`Socket authentication failed for ${socket.id}: ${err.message}`);
    }
  }

  /**
   * Event: joinRoom
   * Allows joining a custom room or personal user room
   */
  socket.on('joinRoom', (data, callback) => {
    try {
      const roomId = typeof data === 'string' ? data : data?.roomId || data?.room;
      const userId = data?.userId;

      if (roomId) {
        socket.join(roomId);
        console.log(`Socket ${socket.id} joined room: ${roomId}`);
      }

      if (userId) {
        socket.userId = userId;
        socket.join(`user_${userId}`);
        console.log(`Socket ${socket.id} joined user room: user_${userId}`);
      }

      if (typeof callback === 'function') {
        callback({ success: true, room: roomId || `user_${userId}` });
      }
    } catch (err) {
      console.error('joinRoom error:', err.message);
      if (typeof callback === 'function') {
        callback({ success: false, message: err.message });
      }
    }
  });

  /**
   * Event: sendMessage
   * Creates message in DB and broadcasts receiveMessage event
   */
  socket.on('sendMessage', async (data, callback) => {
    try {
      const { receiverId, message, senderId: customSenderId } = data || {};
      const senderId = socket.userId || customSenderId;

      if (!senderId) {
        const errPayload = { success: false, message: 'Authentication required to send message' };
        socket.emit('error', errPayload);
        if (typeof callback === 'function') callback(errPayload);
        return;
      }

      if (!receiverId || !message || !message.trim()) {
        const errPayload = { success: false, message: 'receiverId and message are required' };
        socket.emit('error', errPayload);
        if (typeof callback === 'function') callback(errPayload);
        return;
      }

      // Save message to MongoDB
      const newMsg = await Message.create({
        sender: senderId,
        receiver: receiverId,
        message: message.trim(),
      });

      const populated = await Message.findById(newMsg._id)
        .populate('sender', 'name email companyName role')
        .populate('receiver', 'name email companyName role');

      // Emit receiveMessage to recipient and sender personal rooms
      io.to(`user_${receiverId}`).emit('receiveMessage', populated);
      io.to(`user_${senderId}`).emit('receiveMessage', populated);

      if (typeof callback === 'function') {
        callback({ success: true, data: populated });
      }
    } catch (err) {
      console.error('sendMessage socket error:', err.message);
      if (typeof callback === 'function') {
        callback({ success: false, message: err.message });
      }
    }
  });

  /**
   * Event: typing
   * Notify recipient that sender is typing
   */
  socket.on('typing', (data) => {
    const { receiverId } = data || {};
    const senderId = socket.userId || data?.senderId;
    if (receiverId && senderId) {
      io.to(`user_${receiverId}`).emit('typing', { senderId });
    }
  });

  /**
   * Event: stopTyping
   * Notify recipient that sender stopped typing
   */
  socket.on('stopTyping', (data) => {
    const { receiverId } = data || {};
    const senderId = socket.userId || data?.senderId;
    if (receiverId && senderId) {
      io.to(`user_${receiverId}`).emit('stopTyping', { senderId });
    }
  });

  /**
   * Event: messageRead
   * Marks message as read in DB and notifies sender
   */
  socket.on('messageRead', async (data) => {
    try {
      const { messageId, senderId } = data || {};
      const readerId = socket.userId || data?.readerId;

      if (messageId) {
        await Message.findByIdAndUpdate(messageId, {
          read: true,
          readAt: new Date(),
        });
      } else if (senderId && readerId) {
        await Message.updateMany(
          { sender: senderId, receiver: readerId, read: false },
          { $set: { read: true, readAt: new Date() } }
        );
      }

      if (senderId) {
        io.to(`user_${senderId}`).emit('messageRead', {
          readerId,
          messageId,
          readAt: new Date(),
        });
      }
    } catch (err) {
      console.error('messageRead socket error:', err.message);
    }
  });

  /**
   * Event: disconnect
   */
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id} (user: ${socket.userId || 'anonymous'})`);
  });
};

module.exports = {
  registerSocketHandlers,
};
