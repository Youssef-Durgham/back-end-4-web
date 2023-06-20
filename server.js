const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();
dotenv.config();
const home = require("./routes/Home");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const sslify = require("express-sslify");
const pm2 = require('pm2')
const socketio = require('socket.io');
const http = require('http');
const jwt = require("jsonwebtoken");
const Users = require("./model/Users.js");
const TaxiOrder = require("./model/TaxiOrder.js");

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());
app.use(helmet());
const rateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 400,
});
app.use(rateLimiter);

mongoose
  .connect("mongodb+srv://yusifdhrgam:Qwertly123@cluster0.t9peqde.mongodb.net/test", { useNewUrlParser: true })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

app.use("/", require("./routes/Home"));

const clients = {};
const locations = {};

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('error', (error) => {
    console.error('Socket Error:', error);
  });

  let currentUserId = null;
  
  socket.on('authenticate', async (token) => {
    try {
        const decoded = jwt.verify(token, "1234567890");
        currentUserId = decoded.id;
        clients[currentUserId] = socket;

        const user = await Users.findById(currentUserId);
        if(user.role === 'captain') {
            socket.on('updateLocation', (location) => {
                locations[currentUserId] = location;
            });
        } 
        else if (user.role === 'user') {
            const order = await TaxiOrder.find({ user: user._id, cancelled: false }).sort('-createdAt').limit(1).populate('captain');
            if(order && order.length > 0) {
                const captain = order[0].captain;

                setInterval(() => {
                    if(clients[captain._id]) {
                        socket.emit(`location/${captain._id}`, locations[captain._id]);
                    }
                }, 5000);
            }
        }
    } 
    catch (err) {
        console.error('Error in authentication', err);
        socket.emit('error', 'Error in authentication');
    }
  });

  socket.on('disconnect', () => {
    if(currentUserId) {
        delete clients[currentUserId];
        delete locations[currentUserId];
    }
  });
});

server.listen(3000, () => console.log("Server running on port 3000"));
server.on('error', (error) => {
  console.error('Server Error:', error);
});

io.on('connection_error', (error) => {
  console.error('Socket.io Connection Error:', error);
});

pm2.connect((error) => {
  if (error) {
    console.error(error);
    process.exit(2);
  };

  pm2.start({
    name: 'back-end',
    script: 'server.js',
    instances: 4,
    max_memory_restart: '100M',
  }, (error, apps) => {
    pm2.disconnect();
    if (error) throw error;
  });
});
