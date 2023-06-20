const mongoose = require('mongoose');
const { UserSchema } = require('./Users');

const DeletedUserSchema = new mongoose.Schema({
  originalId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  deletedAt: {
    type: Date,
    default: Date.now,
  },
  userData: UserSchema,
  note: {
    type: String,
  },
});
  
  module.exports = mongoose.model('DeletedUsers', DeletedUserSchema);  
  