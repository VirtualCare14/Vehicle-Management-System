const express = require('express');
const router = express.Router();
const {
  getConversations,
  getMessagesWithUser,
  sendMessage,
} = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

// All messaging routes require authentication
router.use(protect);

router.get('/conversations', getConversations);
router.get('/:userId', getMessagesWithUser);
router.post('/', sendMessage);

module.exports = router;
