const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', ws => {
    console.log('New client connected');

    ws.isAlive = true; // add an isAlive property to the WebSocket instance

    ws.on('pong', () => {
        ws.isAlive = true; // set isAlive to true whenever a pong is received
    });

    ws.on('message', message => {
        // Handle incoming message from this specific client
        console.log('Received: %s', message);
    });
});

// Ping all clients every 30 seconds
setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) {
            console.warn(`Disconnecting unresponsive client`);
            return ws.terminate(); // disconnect if a client doesn't respond in time
        }

        ws.isAlive = false; // set isAlive to false for each client
        ws.ping(() => { }); // send a ping; does nothing if it succeeds
    });
}, 30000);
