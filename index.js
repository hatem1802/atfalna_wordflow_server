const express = require('express');
const database = require('./database');
const auth = require('./routes/auth');
const treatmentRequests = require('./routes/treatmentRequests');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());
app.use(morgan('dev'));
app.use(cors());

// API endpoints
app.use('/api/auth', auth);
app.use('/api/treatment-requests', treatmentRequests);

async function startServer() {
	try {
		await database.query('SELECT 1');
		app.listen(port, () => {
			console.log(`Server running on port:${port}`);
		});
	} catch (error) {
		console.error('Unable to connect to MySQL:', error.message);
		process.exitCode = 1;
	}
}

startServer();
