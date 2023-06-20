const router = require("express").Router();
const Users = require("../model/Users.js");
const jwt = require("jsonwebtoken");
const TaxiOrder = require("../model/TaxiOrder.js");
const Pricing = require("../model/Pricing.js");
const DebtPercentage = require("../model/DebtPercentage.js");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");
const mongoose = require('mongoose');
// const WebSocket = require('ws');
// const wss = new WebSocket.Server({ port: 8080 });


// Get your Firebase server key from the Firebase console.
const serviceAccount = require("../taxi-a519a-firebase-adminsdk-c1qag-a4149b9d00.json");
const NotificationToken = require("../model/NotificationToken.js");
const Notification = require("../model/Notification.js");
const DeletedOrders = require("../model/DeletedOrders.js");
const DeletedUser = require("../model/DeletedUser.js");

// Create a new FCM client.
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// check the user jwt token
const auth = (req, res, next) => {
  try {
    const token = req.header("Authorization");
    if (!token) {
      return res.status(401).json({ error: "No token, authorization denied" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res
      .status(401)
      .json({
        error: "No token, authorization denied",
        source: "authMiddleware",
      });
  }
};

// api for return the users locations and data in the order
router.get('/order-userslocations', auth, async (req, res) => {
  // Extract the user id from the JWT token
  const captainId = req.user.id;

  try {
    // Fetch all non-cancelled orders of the captain
    const orders = await TaxiOrder.find({
      captain: mongoose.Types.ObjectId(captainId),
      cancelled: false,
    });

    // Prepare an array to store user and passenger data
    let userData = [];

    // Prepare an array to store destination data
    let destinations = [];

    // Calculate tomorrow's date (only year, month, day)
    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Function to format date (year, month, day)
    const formatDate = (date) => {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    };

    // Loop through each order
    for (let order of orders) {
      // Fetch main user data
      const user = await Users.findOne(
        { _id: mongoose.Types.ObjectId(order.user) },
        '_id name picture location'
      );

      // Check if a user was found
      if (user) {
        // Check if the user is not going tomorrow
        const userNotGoingTomorrow = order.notGoingDates.find(
          (date) => formatDate(date).getTime() === tomorrow.getTime()
        );

        // Add main user data to the array
        user.isGoingTomorrow = !userNotGoingTomorrow;
        userData.push(user);
      } else {
        console.error('User not found for order:', order._id);
      }

      // Fetch passenger data
      for (let passenger of order.passengers) {
        const passengerData = await Users.findOne(
          { _id: mongoose.Types.ObjectId(passenger.user) },
          '_id name picture location'
        );

        // Check if a passenger was found
        if (passengerData) {
          // Check if the passenger is not going tomorrow
          const passengerNotGoingTomorrow = passenger.notGoingDates.find(
            (date) => formatDate(date).getTime() === tomorrow.getTime()
          );

          // Add passenger data to the array
          passengerData.isGoingTomorrow = !passengerNotGoingTomorrow;
          userData.push(passengerData);
        } else {
          console.error('Passenger not found for order:', order._id);
        }
      }

      // Add destination to destinations array if not already present
      if (!destinations.find((dest) => dest.location.coordinates[0] === order.destination.coordinates[0]
        && dest.location.coordinates[1] === order.destination.coordinates[1])) {
        destinations.push({
          _id: `destination${orders.indexOf(order) + 1}`,
          name: `وجهة ${orders.indexOf(order) + 1}`,
          location: order.destination
        });
      }
    }

    // Combine user and destinations data
    userData = userData.concat(destinations);

    // Send the response
    res.json(userData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// api for send arrive notification
router.post('/send-notification', auth, async (req, res) => {
  const {userId, title, body} = req.body;

  // fetch all tokens of the user
  const tokens = await NotificationToken.find({user: userId});

  // prepare the message
  const message = {
      notification: {
          title: title,
          body: body
      },
      tokens: tokens.map(token => token.token)
  };

  // send the notification
  try {
      const response = await admin.messaging().sendMulticast(message);
      console.log(response.successCount + ' messages were sent successfully');
  } catch (error) {
      console.log('Error sending message:', error);
  }

  // save the notification in the database
  const notification = new Notification({
      user: userId,
      title: title,
      body: body
  });
  try {
      await notification.save();
      res.json({message: 'Notification sent and saved successfully.'});
  } catch (err) {
      res.status(500).json({error: err.message});
  }
});

// websocket connection

// let captainClients = new Map(); // {captainId: ws}
// let userClients = new Map(); // {userId: ws}
// let adminClients = []; // List of admin clients

// wss.on('connection', ws => {
//   console.log(captainClients, userClients);
  
//   ws.on('message', message => {
//     let payload = JSON.parse(message);
//     const { token } = payload;
//     const { role, id } = jwt.verify(token, process.env.JWT_SECRET); // Verify the JWT token
//     console.log(token, role, id)
//     console.log(captainClients, userClients)
//     console.log(payload)

//     // Check role to determine who is connecting (captain, user, or admin)
//     if (role === 'captain') {
//       captainClients.set(id, ws);

//       // Update location if provided
//       if (payload.location) {
//         ws.location = payload.location;

//         // Notify all admin clients about this captain's location
//         adminClients.forEach(adminWs => {
//           if (adminWs.readyState === WebSocket.OPEN) {
//             adminWs.send(JSON.stringify({ captainId: id, location: ws.location }));
//           }
//         });

//         // Send location to main user and passenger users of the captain's order
//         sendCaptainLocationToUsers(id, ws.location);
        
//         // Clear the previous interval, if any
//         if (ws.locationInterval) {
//           clearInterval(ws.locationInterval);
//         }

//         // Set interval to send location every 10 seconds
//         ws.locationInterval = setInterval(() => {
//           if (ws.readyState === WebSocket.OPEN) {
//             ws.send(JSON.stringify({ captainId: id, location: ws.location }));
//           }
//         }, 10000);
//       }
//     } else if (role === 'user') {
//       userClients.set(id, ws);
//       ws.send(JSON.stringify({ message: 'User added successfully!' }));

//       // Find any active (non-cancelled) orders for this user
//       TaxiOrder.find({ user: id, cancelled: false })
//         .sort('-createdAt')
//         .limit(1)
//         .exec((err, orders) => {
//           if (err) return console.error(err);
//           if (orders.length === 0) return;

//           let order = orders[0];
//           let captainId = order.captain;
//           let captainWs = captainClients.get(captainId.toString());

//           // If the captain's WebSocket is open and the location is known, send the location to the user
//           if (captainWs && captainWs.readyState === WebSocket.OPEN && captainWs.location) {
//             ws.send(JSON.stringify({ captainId: captainId, location: captainWs.location }));
//           }
//         });

//     } else if (role === 'admin') {
//       adminClients.push(ws);

//       // Send locations of all connected captains to the admin
//       let locations = [];
//       for (let [captainId, captainWs] of captainClients.entries()) {
//         if (captainWs.readyState === WebSocket.OPEN && captainWs.location) {
//           locations.push({ captainId: captainId, location: captainWs.location });
//         }
//       }
//       ws.send(JSON.stringify(locations));
//     }
//   });

//   ws.on('close', () => {
//     for (let [captainId, captainWs] of captainClients.entries()) {
//       if (ws === captainWs) {
//         captainClients.delete(captainId);

//         // Clear the interval for the captain's WebSocket
//         if (captainWs.locationInterval) {
//           clearInterval(captainWs.locationInterval);
//         }
//       }
//     }

//     for (let [userId, userWs] of userClients.entries()) {
//       if (ws === userWs) {
//         userClients.delete(userId);
//       }
//     }
//   });
// });

// function sendCaptainLocationToUsers(captainId, location) {
//   TaxiOrder.find({ captain: captainId, cancelled: false })
//     .sort('-createdAt')
//     .limit(1)
//     .exec((err, orders) => {
//       if (err) return console.error(err);
//       if (orders.length === 0) return;

//       let order = orders[0];

//       // Send location to main user
//       let userId = order.user;
//       let userWs = userClients.get(userId.toString());
//       if (userWs && userWs.readyState === WebSocket.OPEN) {
//         userWs.send(JSON.stringify({ captainId: captainId, location: location }));
//       }

//       // Send location to all passengers
//       order.passengers.forEach(passenger => {
//         let passengerUserWs = userClients.get(passenger.user.toString());
//         if (passengerUserWs && passengerUserWs.readyState === WebSocket.OPEN) {
//           passengerUserWs.send(JSON.stringify({ captainId: captainId, location: location }));
//         }
//       });
//     });
// }

// api for dahsborad to get all the users by filtering them
router.get('/users-admin', async (req, res) => {
  const { role, filter, limit = 10 } = req.query;

  let page = Number.parseInt(req.query.page);
if (isNaN(page) || page < 1) {
    page = 1;
}

  let filterConditions = {};
  if (role) {
      filterConditions.role = role;
  }

  let totalUsers;
  let users;

  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  let tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1); // set to tomorrow's date
  tomorrow.setHours(0, 0, 0, 0); // set time to start of the day

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  switch (filter) {
    case 'all':
      totalUsers = await Users.countDocuments(filterConditions);
      totalPages = Math.ceil(totalUsers / limit);
      users = await Users.find(filterConditions).limit(limit).skip((page - 1) * limit).sort({createdAt: -1}).exec();
      break;
    case 'haveOrders':
      // Find taxi orders where 'user' field or 'passengers.user' field is not null and order is not cancelled.
      let orders = await TaxiOrder.find({
          $and: [
              { cancelled: false },
              { $or: [ { user: { $ne: null } }, { 'passengers.user': { $exists: true, $ne: null } } ] }
          ]
      }).populate('user').populate('passengers.user').exec();
    
      // Extract users from main orders and passenger orders and merge them into a single array.
      let usersFromMainOrders = orders.map(order => order.user);
      let usersFromPassengerOrders = orders.flatMap(order => order.passengers.map(passenger => passenger.user));
      users = [...usersFromMainOrders, ...usersFromPassengerOrders]
    .filter(user => user !== null) // filter out null values
    .sort((a, b) => b.createdAt - a.createdAt) // sort users by order creation time, recent to old
    .slice((page - 1) * limit, page * limit);
    
      totalUsers = users.length;
      break;    
  case 'noOrders':
      // Find all users who have orders that are not cancelled.
      let usersWithOrders = await TaxiOrder.find({
          $and: [
              { cancelled: false },
              { $or: [ { user: { $ne: null } }, { 'passengers.user': { $exists: true, $ne: null } } ] }
          ]
      }).select('user passengers.user').exec();
      usersWithOrders = usersWithOrders.map(order => order.user).concat(usersWithOrders.flatMap(order => order.passengers.map(passenger => passenger.user)));

      // Find all users who are not in 'usersWithOrders'.
      filterConditions._id = { $nin: usersWithOrders };
      totalUsers = await Users.countDocuments(filterConditions);
      users = await Users.find(filterConditions)
      .skip((page - 1) * Number.parseInt(limit))
          .limit(limit);
      break;
      case 'paid':
        
    
        const paidOrders = await TaxiOrder.find({
          cancelled: false,
      'payments.paymentDate': { $gte: thirtyDaysAgo },
      'payments.status': 'accepted',
        })
          .populate('user')
          .populate('passengers.user')
          .exec();
    
        // Extract users from main orders and passenger orders and merge them into a single array.
        const usersFromMainPaidOrders = paidOrders.map(order => order.user);
        const usersFromPassengerPaidOrders = paidOrders.flatMap(order => order.passengers.map(passenger => passenger.user));
        users = [...usersFromMainPaidOrders, ...usersFromPassengerPaidOrders];
    
        totalUsers = users.length;
        users = users
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) // sort users by order creation time, recent to old
          .slice((page - 1) * limit, page * limit);
    
        break;
    
        case 'notPaid':
          const notPaidOrders = await TaxiOrder.find({
            cancelled: false,
            $or: [
              { 'payments.paymentDate': { $lt: thirtyDaysAgo } },
              { payments: { $size: 0 } },
            ],
          })
            .populate('user')
            .populate('passengers.user')
            .exec();
        
          // Extract users from main orders and passenger orders and merge them into a single array.
          const usersFromMainNotPaidOrders = notPaidOrders.map(order => order.user);
          const usersFromPassengerNotPaidOrders = notPaidOrders.flatMap(order => order.passengers.map(passenger => passenger.user));
          
          users = [...usersFromMainNotPaidOrders, ...usersFromPassengerNotPaidOrders]
            .filter(user => user !== null); // filter out null values
        
          totalUsers = users.length;
          users = users
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) // sort users by order creation time, recent to old
            .slice((page - 1) * limit, page * limit);
        
          break;        
            case 'notGoingDates':
              // Find taxi orders where 'notGoingDates' array contains tomorrow's date and the order is not cancelled.
              let notGoingOrders = await TaxiOrder.find({
                  cancelled: false,
                  notGoingDates: tomorrow
              }).populate('user').populate('passengers.user').exec();
  
              // Extract users from main orders and passenger orders and merge them into a single array.
              let usersFromMainNotGoingOrders = notGoingOrders.map(order => order.user);
              let usersFromPassengerNotGoingOrders = notGoingOrders.flatMap(order => order.passengers.map(passenger => passenger.user));
              users = [...usersFromMainNotGoingOrders, ...usersFromPassengerNotGoingOrders];
  
              totalUsers = users.length;
              users = users
  .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) // sort users by order creation time, recent to old
  .slice((page - 1) * limit, page * limit);

              break;
              case 'deletedUser':
                const deletedUsers = await DeletedUser.find().exec();
            
                // Extract users from deleted users.
                const usersFromDeletedUsers = deletedUsers.map(deletedUser => deletedUser.userData);
            
                users = usersFromDeletedUsers;
              
                totalUsers = users.length;
                users = users
                  .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) // sort users by deletion time, recent to old
                  .slice((page - 1) * limit, page * limit);
              
                break;
              case 'deletedOrder':
  const cancelledOrders = await DeletedOrders.find()
    .populate({
      path: 'cancelledBy',
      model: 'Users',
      select: 'name',
    })
    .exec();

  // Extract users from cancelled orders.
  const usersFromCancelledOrders = cancelledOrders.map(order => ({
    user: order.cancelledBy,
    order: order
  })).filter(orderUserPair => orderUserPair.user !== null);
  
  users = usersFromCancelledOrders;
  
  totalUsers = users.length;
  users = users
    .sort((a, b) => (b.user && b.user.createdAt ? b.user.createdAt.getTime() : 0) - (a.user && a.user.createdAt ? a.user.createdAt.getTime() : 0))
    .slice((page - 1) * limit, page * limit);
  


  break;
     
      case 'points':
          // Here, you could filter by a specific point threshold if you want
          filterConditions.points = { $gt: 0 }; // only users with points
          totalUsers = await Users.countDocuments(filterConditions);
          users = await Users.find(filterConditions)
              .sort({points: -1}) // sort users by points, high to low
              .skip((page - 1) * Number.parseInt(limit))
              .limit(limit);
          break;
      case 'ratings':
          // Here, you could filter by a specific rating threshold if you want
          filterConditions['ratings.value'] = { $gt: 0 }; // only users with ratings
          totalUsers = await Users.countDocuments(filterConditions);
          users = await Users.find(filterConditions)
              .sort({'ratings.value': -1}) // sort users by ratings, high to low
              .skip((page - 1) * Number.parseInt(limit))
              .limit(limit);
          break;
      default:
          totalUsers = await Users.countDocuments(filterConditions);
          users = await Users.find(filterConditions)
          .skip((page - 1) * Number.parseInt(limit))
              .limit(limit);
  }

  // Return the response only if 'users' and 'totalUsers' variables are defined
  if (typeof users !== 'undefined' && typeof totalUsers !== 'undefined') {
      res.json({
          totalUsers: totalUsers,
          totalPages: Math.ceil(totalUsers / limit),
          currentPage: page,
          users: users
      });
  } else {
      res.status(400).json({ message: 'Invalid filter type.' });
  }
});

// api to return user data from the id
router.get('/users/:id', async (req, res) => {
  const userId = req.params.id;

  try {
    // Find the user by ID in the database
    const user = await Users.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return the user data
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// api to return all order data for the user
router.get('/orders-data/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    // Check if the user exists
    const user = await Users.findById(userId);
    if (!user) {
      return res.status(399).json({ message: 'User not found' });
    }

    // Find the orders where the user is the main user or a passenger, sorted from newest to oldest
    const orders = await TaxiOrder.find({
      $or: [
        { user: userId },
        { 'passengers.user': userId }
      ]
    })
    .populate('user', 'name')
    .populate('captain', '-password') // Exclude password field from captain data
    .sort({ createdAt: -1 });

    if (orders.length === 0) {
      return res.status(399).json({ message: 'No orders found for the user' });
    }

    // Return the order data
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// api to return all order data for the captain
router.get('/captain-orders/:captainId', async (req, res) => {
  const captainId = req.params.captainId;

  try {
    // Check if the captain exists
    const captain = await Users.findById(captainId);
    if (!captain) {
      return res.status(404).json({ message: 'Captain not found' });
    }

    // Find the orders where the captain is assigned, sorted from newest to oldest
    const orders = await TaxiOrder.find({ captain: captainId })
      .populate('user', 'name picture phonenumber')
      .populate({
        path: 'passengers.user',
        select: 'name picture phonenumber',
      })
      .sort({ createdAt: -1 });

    if (orders.length === 0) {
      return res.status(404).json({ message: 'No orders found for the captain' });
    }

    // Return the order data
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});






module.exports = router;