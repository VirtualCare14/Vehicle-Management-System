const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/response');
const { getIO } = require('../socket/socket');

/**
 * @desc    Get all active conversation threads for current user
 * @route   GET /api/messages/conversations
 * @access  Private (Vendor or Admin)
 */
const getConversations = async (req, res, next) => {
  try {
    const currentUserId = req.user._id;

    // Find all messages involving current user
    const messages = await Message.find({
      $or: [{ sender: currentUserId }, { receiver: currentUserId }],
    })
      .sort({ createdAt: -1 })
      .populate('sender', 'name email companyName role status')
      .populate('receiver', 'name email companyName role status');

    // Group messages by conversation partner
    const conversationsMap = new Map();

    for (const msg of messages) {
      const isSender = msg.sender._id.toString() === currentUserId.toString();
      const partner = isSender ? msg.receiver : msg.sender;
      const partnerId = partner._id.toString();

      if (!conversationsMap.has(partnerId)) {
        conversationsMap.set(partnerId, {
          user: partner,
          lastMessage: {
            _id: msg._id,
            message: msg.message,
            createdAt: msg.createdAt,
            senderId: msg.sender._id,
            read: msg.read,
          },
          unreadCount: 0,
        });
      }

      // Count unread messages received by current user
      if (!isSender && !msg.read) {
        const convo = conversationsMap.get(partnerId);
        convo.unreadCount += 1;
      }
    }

    const conversations = Array.from(conversationsMap.values());

    // If current user is a vendor with no conversation history, provide admin contact
    if (conversations.length === 0 && req.user.role === 'vendor') {
      const admins = await User.find({ role: 'admin' }).select('name email role');
      const defaultContacts = admins.map((admin) => ({
        user: admin,
        lastMessage: null,
        unreadCount: 0,
      }));
      return sendSuccess(
        res,
        200,
        'Conversations retrieved successfully',
        defaultContacts
      );
    }

    return sendSuccess(res, 200, 'Conversations retrieved successfully', conversations);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get message history with a specific user
 * @route   GET /api/messages/:userId
 * @access  Private (Vendor or Admin)
 */
const getMessagesWithUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendError(res, 400, 'Invalid user ID format');
    }

    const targetUser = await User.findById(userId).select('name email companyName role status');
    if (!targetUser) {
      return sendError(res, 404, 'User not found');
    }

    // Mark unread messages sent by targetUser to current user as read
    const unreadUpdated = await Message.updateMany(
      {
        sender: userId,
        receiver: currentUserId,
        read: false,
      },
      {
        $set: { read: true, readAt: new Date() },
      }
    );

    // Notify target user via socket if messages were read
    if (unreadUpdated.modifiedCount > 0) {
      try {
        const io = getIO();
        io.to(`user_${userId}`).emit('messageRead', {
          readerId: currentUserId.toString(),
          readAt: new Date(),
        });
      } catch (err) {
        // Socket may not be connected, non-blocking
      }
    }

    // Retrieve conversation messages
    const { page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const query = {
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId },
      ],
    };

    const [messages, total] = await Promise.all([
      Message.find(query)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limitNum)
        .populate('sender', 'name email role')
        .populate('receiver', 'name email role'),
      Message.countDocuments(query),
    ]);

    return sendSuccess(
      res,
      200,
      'Messages retrieved successfully',
      messages,
      {
        partner: targetUser,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum) || 1,
        },
      }
    );
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Send a message to a user (Admin <-> Vendor)
 * @route   POST /api/messages
 * @access  Private (Vendor or Admin)
 */
const sendMessage = async (req, res, next) => {
  try {
    const { receiverId, message } = req.body;
    const senderId = req.user._id;

    if (!receiverId || !message || !message.trim()) {
      return sendError(res, 400, 'Please provide receiverId and message content');
    }

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return sendError(res, 400, 'Invalid receiver ID format');
    }

    if (receiverId.toString() === senderId.toString()) {
      return sendError(res, 400, 'You cannot send a message to yourself');
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return sendError(res, 404, 'Message recipient not found');
    }

    const newMessage = await Message.create({
      sender: senderId,
      receiver: receiverId,
      message: message.trim(),
    });

    const populatedMessage = await Message.findById(newMessage._id)
      .populate('sender', 'name email role companyName')
      .populate('receiver', 'name email role companyName');

    // Real-time notification through Socket.IO
    try {
      const io = getIO();
      // Emit to recipient's personal room
      io.to(`user_${receiverId}`).emit('receiveMessage', populatedMessage);
      // Emit to sender's personal room (for multi-device sync)
      io.to(`user_${senderId}`).emit('receiveMessage', populatedMessage);
    } catch (err) {
      // Socket emission failure shouldn't fail HTTP response
      console.warn('Socket emit warning:', err.message);
    }

    return sendSuccess(res, 201, 'Message sent successfully', populatedMessage);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getConversations,
  getMessagesWithUser,
  sendMessage,
};
