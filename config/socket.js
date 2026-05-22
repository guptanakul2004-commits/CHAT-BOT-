const socketIO = require('socket.io');

module.exports = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: '*',
    },
  });

  io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('message', (msg) => {
      io.emit('message', msg);
    });
  });

  return io;
};
