const mongoose = require('mongoose');
const { taxiOrderSchema } = require('./TaxiOrder');


const DeletedOrderSchema = new mongoose.Schema({
  originalId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  deletedAt: {
    type: Date,
    default: Date.now,
  },
  orderData: taxiOrderSchema,
  note: {
    type: String,
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Users',
    required: true,
  },
});

module.exports = mongoose.model('DeletedOrders', DeletedOrderSchema);
