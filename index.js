require('dotenv').config();
const port = process.env.PORT || 8080;;
const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion } = require('mongodb');
const mongoose = require('mongoose');

//----------------------------------------------To be moved out later START
// Connection URL
const uri = `mongodb+srv://mbellot:Testing123@cluster0.b1b8pz5.mongodb.net/AcousticTripplite?retryWrites=true&w=majority`;
// Databases Name
const dbName = 'AcousticTripplite';
// Collection Name
const collectionNameUsers = 'Users';
const collectionNameClients = 'Clients';

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

client.connect()
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
        console.error('Failed to connect to MongoDB:', err);
        process.exit(1);
    })

process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down gracefully...');

    client.close()
        .then(() => console.log('Closed MongoDB connection'))
        .catch(err => console.error('Failed to close MongoDB connection:', err))
        .finally(() => process.exit(0));
});


// Connect to MongoDB
async function connectToMongo(uri, dbName, collectionNameUsers, email, password) {
    try {

        const db = client.db(dbName);
        const collection = db.collection(collectionNameUsers);

        const user = await collection.findOne({ email: email });

        if (!user) {
            console.log('User not found in MongoDB');
            return false;
        }

        const result = await bcrypt.compare(password, user.password);

        if (result) {
            console.log('Password is correct');
            return true;
        } else {
            console.log('Password is incorrect');
            return false;
        }

    } catch (err) {
        console.log('Error connecting to MongoDB:', err);
        throw err;
    }
}

//Get all clients
async function getAllClientsFromMongo(uri, dbName, collectionNameClients) {
    let data;
    try {
        const db = client.db(dbName);
        const collection = db.collection(collectionNameClients);

        data = await collection.find().toArray();

    } catch (err) {
        console.log('Error connecting to MongoDB:', err);
        throw err;
    }
    return data;
}

async function getLoadsFromMongo(dbName, collectionNameClients, mac) {
    console.log('getLoadsFromMongo has been called')
    let data;
    let loads = {};
    try {
        const db = client.db(dbName);
        const collection = db.collection(collectionNameClients);

        data = await collection.findOne({ mac: mac });

        if (data && data.loads) {
            Object.keys(data.loads).forEach(key => {
                loads[key] = data.loads[key].state;
            });
        }
    } catch (err) {
        console.log('Error connecting to MongoDB:', err);
        throw err;
    }
    return loads;
}

function sendControl(miniPCs, location, mac, load, control, id) {
    return new Promise((resolve, reject) => {
        console.log('sendControl function called');
        const PC = miniPCs.get(location);
        if (!PC) {
            console.log('No ws pc');
            reject('No mini PC found with the given location');
        }
        try {
            const message = {
                type: 'controlLoad',
                mac,
                load,
                control,
                id
            }
            console.log('Sending message:', message);
            PC.send(JSON.stringify(message));
            return 'control sent'
            resolve('control sent');
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
            reject('Error sending message');
        }
    })
}


async function getLoadStates(miniPCs, id, location, device, mac) {
    return new Promise((resolve, reject) => {
        console.log('Get load states called with', location, device, mac);
        const PC = miniPCs.get(location);
        // console.log('PC:', PC);
        // Check if the WebSocket connection exists
        if (!PC) {
            console.log('No ws pc');
            // Handle case where there is no mini PC with the given id
            throw new Error('No mini PC found with the given location');
            reject('Error sending message');
        }
        // Send a message to the mini PC
        try {
            const message = {
                type: 'isLooking',
                device,
                mac,
                id
            };
            console.log('Sending message:', message);
            PC.send(JSON.stringify(message));
            resolve('states sent')
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    })
}


async function setMultipleLoadStates(dbName, collectionNameClients, mac, loadStates) {
    try {
        const db = client.db(dbName);
        const collection = db.collection(collectionNameClients);

        // Iterate over each key-value pair in loadStates
        for (const [loadNumber, state] of Object.entries(loadStates)) {
            // Prepare an update operator for this load
            const updateOperator = { [`loads.${loadNumber}.state`]: state };

            // Use $set operator to update the state of the load for the specified mac
            const result = await collection.updateOne({ mac: mac }, { $set: updateOperator });

            // console.log(`Update result for loadNumber ${loadNumber}:`, result); // This will log the result of update operation
        }
    } catch (err) {
        console.log('Error connecting to MongoDB:', err);
        throw err;
    }
}




//----------------------------------------------To be moved out later STOP

// Create an express app for handling HTTP requests
const app = express();

// Use middleware for parsing JSON and urlencoded form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors())

// Middleware to check if user is authenticated
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        req.user = user;
        next();
    });
};

// Handle HTTP requests from the front-end webpage
app.post('/server/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await connectToMongo(uri, dbName, collectionNameUsers, email, password);
        if (result) {
            const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });
            res.status(200).json({ token });
        } else {
            res.status(401).send('Password is incorrect');
        }
    } catch (err) {
        console.log('Error connecting to MongoDB:', err);
        res.status(500).send('Error connecting to MongoDB');
    }
});

app.post('/server/sendLoads', async (req, res) => {
    console.log('sendLoads route called');
    const { loads, mac } = req.body;
    console.log('Received loads and mac:', loads, mac); // This will log the received 'loads' and 'mac'
    try {
        await setMultipleLoadStates(dbName, collectionNameClients, mac, loads);
        res.status(200).send('Load States sent to MongoDB');
    } catch (err) {
        console.log('Error in sendLoads route', err)
        res.status(500).send('Error in sendLoads route')
    }
})


//Get request to fetch client list from mongodb
app.get('/server/clientlist', authenticateUser, async (req, res) => {
    try {
        const data = await getAllClientsFromMongo(uri, dbName, collectionNameClients);
        res.send(data);
    } catch (err) {
        console.log('Error connecting to MongoDB:', err);
        res.status(500).send('Error connecting to MongoDB');
    }
})

// app.get('/server/getLoadStates/:location/:device/:mac', authenticateUser, async (req, res) => {
//     const { location, device, mac } = req.params;
//     console.log('Inside route for getLoadStates');
//     // Get the WebSocket connection for the mini PC
//     try {
//         const loads = await getLoadStates(miniPCs, location, device, mac);
//         res.status(200).json(loads);
//     } catch (error) {
//         console.error('Error in getLoadStates:', error);
//         res.status(500).json({ error: error.message });
//     }
// });

app.get('/server/controlLoads/:location/:mac/:load/:control', authenticateUser, async (req, res) => {
    const { location, mac, load, control } = req.params;
    console.log('Inside route for control');
    try {
        const sendingControl = await sendControl(miniPCs, location, mac, load, control);
        res.status(200).send(sendingControl);
    } catch (error) {
        console.log('Error in controlLoads', error);
        res.status(500).json({ error: error });
    }
});





// Set up HTTP server
const httpServer = http.createServer(app);

// Create a WebSocket server
const wss = new WebSocket.Server({ server: httpServer });

//Keep track of all connected mini PC's:
const miniPCs = new Map();

//Keep track of all connected User's on a Webpage:
const Users = new Map();

//Keep track of all setIntervals:
const setIntervals = new Map();

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New connection established');

    // Handle messages received from mini PC
    ws.on('message', async (message) => {
        const data = JSON.parse(message);

        if (data.type === 'register') {
            //Register this mini PC:
            miniPCs.set(data.id, ws);
            // console.log(miniPCs)
            console.log(`Registered mini PC with ID: ${data.id}`)
        } else if (data.type === 'webpageuser') {
            //Register this User:
            Users.set(data.id, ws);

            const Web = Users.get(data.id)
            // console.log(miniPCs)
            console.log(`Registered User with ID: ${data.id}`);
            const interval = setInterval(() => {
                console.log('keep webpage connection alive')
                Web.send('keepalive');
            }, 30000);
            keepaliveIntervals.set(data.id, interval);
            //Request from Mini PC the load states
            await getLoadStates(miniPCs, data.id, data.location, data.device, data.mac);
        }
        else if (data.type === 'toWebpage') {
            const { id, states } = data;
            const Web = Users.get(id);
            if (!Web) {
                console.log('No User');
                throw new Error('No User signed in with that id')
            }
            try {
                const message = {
                    type: 'toWebpage',
                    states
                }
                console.log('Sending message:', message);
                Web.send(JSON.stringify(message));
            } catch (error) {
                console.error('Error sending message:', error);
                throw error;
            }
        } else if (data.type === 'controlLoad') {
            const { location, mac, load, control, id } = data;
            await sendControl(miniPCs, location, mac, load, control, id);
        } else if (data.type === 'newTrippDetected') {
            console.log('Unassigned trip detected', data)
            //send to mongodb

        } else if (data.type === 'keepAlive') {
            console.log('Keep Alive connection from ', data.id)
        }

        // Send a response message back to the mini PC
        ws.send(JSON.stringify({ message: 'Hello from the server!' }));

    });

    // Handle WebSocket close event
    ws.on('close', () => {
        // Remove this mini PC from the map:
        for (const [id, socket] of miniPCs.entries()) {
            if (socket === ws) {
                miniPCs.delete(id);
                console.log(`Unregistered mini PC with ID: ${id}`);
            }
        }

        // Remove this user from the map:
        for (const [id, socket] of Users.entries()) {
            if (socket === ws) {
                // Clear the keepalive interval
                const interval = keepaliveIntervals.get(id);
                clearInterval(interval);
                // Remove the interval from the map
                keepaliveIntervals.delete(id);

                Users.delete(id);
                console.log(`Unregistered user with ID: ${id}`);
            }
        }
    });

});

httpServer.listen(port, () => {
    console.log(`HTTP and WebSocket server listening on port ${port}`);
});
